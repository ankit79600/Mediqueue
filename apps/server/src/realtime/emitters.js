/**
 * emitters.js — all Socket.IO server-side emits.
 *
 * flush(io, changes) is the ONLY place that emits events. Call it after every
 * DB mutation that returns a `changes` object (E9/E12/E17-E20/E15).
 *
 * Emission order follows SOCKET_CONTRACT §5.
 */

import prisma from '../db.js';
import config from '../config.js';
import { SOCKET_EVENTS, rooms } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import {
  fmtToken, fmtTokenPublic, fmtDoctor, fmtQueueSnapshot, fmtDisplaySnapshot, fmtNotification,
} from '../presenter.js';
import { dispatchSms } from '../services/notification.service.js';
import { buildAdminStats } from '../services/stats.service.js';

// ─── STATS THROTTLE ───────────────────────────────────────────────────────────
// Trailing-edge, 1 s window — SOCKET_CONTRACT §5 note.

let _statsTimer = null;

function scheduleStatsUpdate(io) {
  if (_statsTimer) clearTimeout(_statsTimer);
  _statsTimer = setTimeout(async () => {
    _statsTimer = null;
    try {
      const stats = await buildAdminStats(getHospitalDate());
      io.to(rooms.admin()).emit(SOCKET_EVENTS.STATS_UPDATE, stats);
    } catch (err) {
      console.error('[emit] stats:update error:', err.message);
    }
  }, 1_000);
}

// ─── DISPLAY SNAPSHOT BUILDER ─────────────────────────────────────────────────

export async function buildDisplaySnapshotForDept(departmentId, today) {
  const [dept, doctors] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId } }),
    prisma.doctor.findMany({ where: { departmentId, isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!dept) return null;

  const ctxEntries = await Promise.all(
    doctors.map(async d => {
      const ctx = await buildDoctorContext(d.id, today);
      return [d.id, { ...ctx, etaMap: computeQueueEtas(ctx.doctor, ctx.waiting, ctx.called) }];
    })
  );
  const ctxMap = new Map(ctxEntries);

  const nowServing = doctors.map(d => ({
    doctorId:   d.id,
    doctorName: d.name,
    room:       d.room,
    tokenNo:    ctxMap.get(d.id)?.called?.tokenNo ?? null,
  }));

  const allWaiting = [];
  for (const d of doctors) {
    const ctx = ctxMap.get(d.id);
    for (const t of ctx?.waiting ?? []) {
      const eta = ctx.etaMap.get(t.id);
      if (eta) allWaiting.push({ t, d, estimatedCallAt: eta.estimatedCallAt });
    }
  }
  allWaiting.sort((a, b) => a.estimatedCallAt - b.estimatedCallAt);

  const upNext = allWaiting.slice(0, 5).map(({ t, d }) => ({
    tokenNo: t.tokenNo, doctorName: d.name, room: d.room, priority: t.priority,
  }));

  const queueLength = [...ctxMap.values()].reduce((sum, ctx) => sum + ctx.waiting.length, 0);
  return fmtDisplaySnapshot(dept, nowServing, upNext, queueLength);
}

// ─── QUEUE SNAPSHOT BUILDER ───────────────────────────────────────────────────

async function buildQueueSnapshot(doctorId, today) {
  const { doctor, waiting, called } = await buildDoctorContext(doctorId, today);
  if (!doctor) return null;

  const etaMap = computeQueueEtas(doctor, waiting, called);

  const [servedToday, noShowToday, dept] = await Promise.all([
    prisma.token.count({ where: { doctorId, serviceDate: today, status: 'COMPLETED' } }),
    prisma.token.count({ where: { doctorId, serviceDate: today, status: 'NO_SHOW' } }),
    prisma.department.findUnique({ where: { id: doctor.departmentId } }),
  ]);

  const docShape    = fmtDoctor(doctor, { queueLength: waiting.length, currentTokenNo: called?.tokenNo ?? null });
  const deptBrief   = { id: dept.id, name: dept.name, code: dept.code };
  const calledShape = called ? fmtToken(called, null) : null;
  const waitingFmt  = waiting.map(t => fmtToken(t, etaMap.get(t.id) ?? null));
  return fmtQueueSnapshot(docShape, deptBrief, calledShape, waitingFmt, { servedToday, noShowToday });
}

// ─── FLUSH ────────────────────────────────────────────────────────────────────

/**
 * Emit all socket events resulting from one DB mutation, in SOCKET_CONTRACT §5 order.
 *
 * @param {import('socket.io').Server} io
 * @param {{ doctorId, departmentId, called, skipped, ended, alerts, notifications }} changes
 */
export async function flush(io, changes) {
  if (!io || !changes) return;

  const { doctorId, departmentId, called, skipped, ended, alerts, notifications } = changes;
  const today = getHospitalDate();

  // ── Fetch fresh queue state post-commit ────────────────────────────────────
  const { doctor, waiting, called: currentCalled } = await buildDoctorContext(doctorId, today);
  const etaMap = computeQueueEtas(doctor, waiting, currentCalled);

  // Build fast-lookup maps from what we already fetched (avoids extra DB round-trips)
  const waitingById = new Map(waiting.map(t => [t.id, t]));
  const calledById  = currentCalled ? new Map([[currentCalled.id, currentCalled]]) : new Map();

  // ── Step 1 : primary event (called / skipped / ended) ─────────────────────

  // T3 — token:called
  if (called) {
    io.to(rooms.token(called.tokenId)).emit(SOCKET_EVENTS.TOKEN_CALLED, called);
    io.to(rooms.tokenPublic(called.tokenId)).emit(SOCKET_EVENTS.TOKEN_CALLED, called);
  }

  // T4 — token:skipped
  if (skipped) {
    io.to(rooms.token(skipped.tokenId)).emit(SOCKET_EVENTS.TOKEN_SKIPPED, skipped);
    io.to(rooms.tokenPublic(skipped.tokenId)).emit(SOCKET_EVENTS.TOKEN_SKIPPED, skipped);
  }

  // T2/T4(NO_SHOW)/T5/T6 — token:ended
  for (const e of ended) {
    const endedPayload = { tokenId: e.tokenId, tokenNo: e.tokenNo, status: e.status, endedAt: e.endedAt };
    io.to(rooms.token(e.tokenId)).emit(SOCKET_EVENTS.TOKEN_ENDED, endedPayload);
    io.to(rooms.tokenPublic(e.tokenId)).emit(SOCKET_EVENTS.TOKEN_ENDED, endedPayload);
  }

  // ── Step 2 : token:update + tokenPublic:update ─────────────────────────────

  // Collect primary token ids (the tokens whose status/state changed in the mutation)
  const primaryTokenIds = new Set(
    [called?.tokenId, skipped?.tokenId, ...ended.map(e => e.tokenId)].filter(Boolean)
  );

  // For primary tokens that are no longer in waiting/called (ended/cancelled), fetch from DB
  const needsFetch = [...primaryTokenIds].filter(id => !waitingById.has(id) && !calledById.has(id));
  const fetchedRows = needsFetch.length
    ? await prisma.token.findMany({ where: { id: { in: needsFetch } }, include: TOKEN_INCLUDE })
    : [];
  const fetchedById = new Map(fetchedRows.map(t => [t.id, t]));

  const getToken = id => waitingById.get(id) ?? calledById.get(id) ?? fetchedById.get(id) ?? null;

  // Emit token:update for primary tokens
  for (const tokenId of primaryTokenIds) {
    const t = getToken(tokenId);
    if (!t) continue;
    const eta = etaMap.get(tokenId) ?? null;
    io.to(rooms.token(tokenId)).emit(SOCKET_EVENTS.TOKEN_UPDATE, fmtToken(t, eta));
    io.to(rooms.tokenPublic(tokenId)).emit(SOCKET_EVENTS.TOKEN_PUBLIC_UPDATE, fmtTokenPublic(t, eta));
  }

  // Emit token:update for all WAITING tokens (positions/ETAs shifted)
  for (const t of waiting) {
    if (primaryTokenIds.has(t.id)) continue; // already emitted above
    const eta = etaMap.get(t.id) ?? null;
    io.to(rooms.token(t.id)).emit(SOCKET_EVENTS.TOKEN_UPDATE, fmtToken(t, eta));
    io.to(rooms.tokenPublic(t.id)).emit(SOCKET_EVENTS.TOKEN_PUBLIC_UPDATE, fmtTokenPublic(t, eta));
  }

  // Emit token:update for the current CALLED token (ETA resets after complete/no-show)
  if (currentCalled && !primaryTokenIds.has(currentCalled.id)) {
    io.to(rooms.token(currentCalled.id)).emit(SOCKET_EVENTS.TOKEN_UPDATE, fmtToken(currentCalled, null));
    io.to(rooms.tokenPublic(currentCalled.id)).emit(SOCKET_EVENTS.TOKEN_PUBLIC_UPDATE, fmtTokenPublic(currentCalled, null));
  }

  // ── Step 3 : token:alert (3-away) ─────────────────────────────────────────
  for (const alert of alerts) {
    io.to(rooms.token(alert.tokenId)).emit(SOCKET_EVENTS.TOKEN_ALERT, alert);
    io.to(rooms.tokenPublic(alert.tokenId)).emit(SOCKET_EVENTS.TOKEN_ALERT, alert);
  }

  // ── Step 4 : queue:update ─────────────────────────────────────────────────
  const queueSnapshot = await buildQueueSnapshot(doctorId, today);
  if (queueSnapshot) {
    io.to(rooms.doctor(doctorId)).emit(SOCKET_EVENTS.QUEUE_UPDATE, queueSnapshot);
  }

  // ── Step 5 : display:update ───────────────────────────────────────────────
  const displaySnapshot = await buildDisplaySnapshotForDept(departmentId, today);
  if (displaySnapshot) {
    io.to(rooms.dept(departmentId)).emit(SOCKET_EVENTS.DISPLAY_UPDATE, displaySnapshot);
  }

  // ── Step 6 : stats:update (throttled, 1 s) ────────────────────────────────
  scheduleStatsUpdate(io);

  // ── Step 7 : notification:new ─────────────────────────────────────────────
  // Re-fetch with token relation so fmtNotification can populate tokenNo.
  // Fire dispatchSms fire-and-forget after each SMS_SIMULATED row.
  if (notifications.length) {
    const fullNotifs = await prisma.notification.findMany({
      where:   { id: { in: notifications.map(n => n.id) } },
      include: { token: { select: { tokenNo: true } } },
    });
    for (const n of fullNotifs) {
      io.to(rooms.admin()).emit(SOCKET_EVENTS.NOTIFICATION_NEW, fmtNotification(n));
      dispatchSms(n).catch(err => console.error('[sms] dispatch error:', err.message));
    }
  }

  if (config.NODE_ENV !== 'production') {
    console.log(`[emit] queue:update doctor:${doctorId}`);
    console.log(`[emit] display:update dept:${departmentId}`);
    if (called)  console.log(`[emit] token:called ${called.tokenId}`);
    if (skipped) console.log(`[emit] token:skipped ${skipped.tokenId}`);
    for (const e of ended) console.log(`[emit] token:ended ${e.tokenId} (${e.status})`);
    for (const a of alerts) console.log(`[emit] token:alert ${a.tokenId} pos=${a.position}`);
  }
}

// ─── T7 ETA TICK ─────────────────────────────────────────────────────────────
// Runs every ETA_TICK_MS (30 s). Re-broadcasts ETAs for all doctors that have
// active tokens today so client position timers stay accurate.

export async function etaTick(io) {
  const today = getHospitalDate();

  try {
    // Find all unique (doctorId, departmentId) pairs with active tokens today
    const active = await prisma.token.findMany({
      where:    { serviceDate: today, status: { in: ['WAITING', 'CALLED'] } },
      distinct: ['doctorId'],
      select:   { doctorId: true, departmentId: true },
    });

    const deptIds = new Set();

    for (const { doctorId, departmentId } of active) {
      const { doctor, waiting, called } = await buildDoctorContext(doctorId, today);
      if (!doctor) continue;

      const etaMap = computeQueueEtas(doctor, waiting, called);

      for (const t of waiting) {
        const eta = etaMap.get(t.id) ?? null;
        io.to(rooms.token(t.id)).emit(SOCKET_EVENTS.TOKEN_UPDATE, fmtToken(t, eta));
        io.to(rooms.tokenPublic(t.id)).emit(SOCKET_EVENTS.TOKEN_PUBLIC_UPDATE, fmtTokenPublic(t, eta));
      }

      const [servedToday, noShowToday, dept] = await Promise.all([
        prisma.token.count({ where: { doctorId, serviceDate: today, status: 'COMPLETED' } }),
        prisma.token.count({ where: { doctorId, serviceDate: today, status: 'NO_SHOW' } }),
        prisma.department.findUnique({ where: { id: departmentId } }),
      ]);
      if (!dept) continue;

      const docShape  = fmtDoctor(doctor, { queueLength: waiting.length, currentTokenNo: called?.tokenNo ?? null });
      const deptBrief = { id: dept.id, name: dept.name, code: dept.code };
      const calledShape  = called ? fmtToken(called, null) : null;
      const waitingShapes = waiting.map(t => fmtToken(t, etaMap.get(t.id) ?? null));
      const snapshot = fmtQueueSnapshot(docShape, deptBrief, calledShape, waitingShapes, { servedToday, noShowToday });

      io.to(rooms.doctor(doctorId)).emit(SOCKET_EVENTS.QUEUE_UPDATE, snapshot);
      deptIds.add(departmentId);
    }

    for (const departmentId of deptIds) {
      const displaySnapshot = await buildDisplaySnapshotForDept(departmentId, today);
      if (displaySnapshot) io.to(rooms.dept(departmentId)).emit(SOCKET_EVENTS.DISPLAY_UPDATE, displaySnapshot);
    }

    scheduleStatsUpdate(io);
  } catch (err) {
    console.error('[eta-tick] error:', err.message);
  }
}
