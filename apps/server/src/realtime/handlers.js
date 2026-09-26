/**
 * handlers.js — Socket.IO connection handler.
 *
 * Registered once per socket on the 'connection' event.
 * All mutations go through REST; this file only handles subscribe/unsubscribe.
 *
 * SOCKET_CONTRACT §3 — client → server events (all with acknowledgements).
 */

import prisma from '../db.js';
import { SOCKET_EVENTS, rooms } from '@mediqueue/shared';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import { verifyTokenSig, fmtToken, fmtTokenPublic, fmtDoctor, fmtQueueSnapshot } from '../presenter.js';
import { getHospitalDate } from '../utils.js';
import { buildDisplaySnapshotForDept } from './emitters.js';
import { buildAdminStats } from '../services/stats.service.js';
import { getStatus as getSimulatorStatus } from '../services/simulator.service.js';

// ─── ACK HELPERS ──────────────────────────────────────────────────────────────

function errAck(code, message) {
  return { ok: false, error: { code, message } };
}

function okAck(room, snapshot) {
  return { ok: true, room, snapshot };
}

// ─── REGISTER ALL HANDLERS FOR ONE SOCKET ─────────────────────────────────────

export function registerHandlers(io, socket) {
  const { user } = socket.data; // set by auth middleware in io.js

  // ── subscribe:token ────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SUBSCRIBE_TOKEN, async (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const { tokenId } = payload ?? {};

      if (!tokenId)  return ack(errAck('VALIDATION_ERROR', 'tokenId required'));
      if (!user)     return ack(errAck('UNAUTHENTICATED', 'Authentication required'));

      const token = await prisma.token.findUnique({ where: { id: tokenId }, include: TOKEN_INCLUDE });
      if (!token)    return ack(errAck('TOKEN_NOT_FOUND', 'Token not found'));

      if (user.role === 'PATIENT' && token.patientId !== user.sub) {
        return ack(errAck('FORBIDDEN', 'You can only subscribe to your own token'));
      }
      if (user.role === 'STAFF' && token.doctorId !== user.doctorId) {
        return ack(errAck('FORBIDDEN', "You can only subscribe to your doctor's tokens"));
      }

      const room = rooms.token(tokenId);
      socket.join(room);

      const { doctor, waiting, called } = await buildDoctorContext(token.doctorId, token.serviceDate);
      const etaMap   = computeQueueEtas(doctor, waiting, called);
      const snapshot = fmtToken(token, etaMap.get(tokenId) ?? null);

      ack(okAck(room, snapshot));
    } catch (err) {
      console.error('[socket] subscribe:token error:', err.message);
      ack(errAck('INTERNAL', 'Internal server error'));
    }
  });

  // ── subscribe:tokenPublic ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SUBSCRIBE_TOKEN_PUBLIC, async (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const { tokenId, sig } = payload ?? {};

      if (!tokenId || !sig)             return ack(errAck('VALIDATION_ERROR', 'tokenId and sig required'));
      if (!verifyTokenSig(tokenId, sig)) return ack(errAck('INVALID_SIGNATURE', 'Invalid or missing signature'));

      const token = await prisma.token.findUnique({ where: { id: tokenId }, include: TOKEN_INCLUDE });
      if (!token) return ack(errAck('TOKEN_NOT_FOUND', 'Token not found'));

      const room = rooms.tokenPublic(tokenId);
      socket.join(room);

      const { doctor, waiting, called } = await buildDoctorContext(token.doctorId, token.serviceDate);
      const etaMap   = computeQueueEtas(doctor, waiting, called);
      const snapshot = fmtTokenPublic(token, etaMap.get(tokenId) ?? null);

      ack(okAck(room, snapshot));
    } catch (err) {
      console.error('[socket] subscribe:tokenPublic error:', err.message);
      ack(errAck('INTERNAL', 'Internal server error'));
    }
  });

  // ── subscribe:doctor ───────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SUBSCRIBE_DOCTOR, async (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const { doctorId } = payload ?? {};

      if (!doctorId) return ack(errAck('VALIDATION_ERROR', 'doctorId required'));
      if (!user)     return ack(errAck('UNAUTHENTICATED', 'Authentication required'));
      if (user.role !== 'ADMIN' && user.role !== 'STAFF') {
        return ack(errAck('FORBIDDEN', 'Staff or admin access required'));
      }
      if (user.role === 'STAFF' && user.doctorId !== doctorId) {
        return ack(errAck('FORBIDDEN', 'You can only subscribe to your own doctor queue'));
      }

      const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
      if (!doctor) return ack(errAck('DOCTOR_NOT_FOUND', 'Doctor not found'));

      const room  = rooms.doctor(doctorId);
      socket.join(room);

      const today = getHospitalDate();
      const { waiting, called } = await buildDoctorContext(doctorId, today);
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
      const snapshot    = fmtQueueSnapshot(docShape, deptBrief, calledShape, waitingFmt, { servedToday, noShowToday });

      ack(okAck(room, snapshot));
    } catch (err) {
      console.error('[socket] subscribe:doctor error:', err.message);
      ack(errAck('INTERNAL', 'Internal server error'));
    }
  });

  // ── subscribe:dept ─────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SUBSCRIBE_DEPT, async (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const { departmentId } = payload ?? {};

      if (!departmentId) return ack(errAck('VALIDATION_ERROR', 'departmentId required'));

      const today    = getHospitalDate();
      const snapshot = await buildDisplaySnapshotForDept(departmentId, today);
      if (!snapshot)  return ack(errAck('DEPARTMENT_NOT_FOUND', 'Department not found'));

      const room = rooms.dept(departmentId);
      socket.join(room);

      ack(okAck(room, snapshot));
    } catch (err) {
      console.error('[socket] subscribe:dept error:', err.message);
      ack(errAck('INTERNAL', 'Internal server error'));
    }
  });

  // ── subscribe:admin ────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.SUBSCRIBE_ADMIN, async (payload, ack) => {
    if (typeof ack !== 'function') return;
    try {
      if (!user)               return ack(errAck('UNAUTHENTICATED', 'Authentication required'));
      if (user.role !== 'ADMIN') return ack(errAck('FORBIDDEN', 'Admin access required'));

      const room = rooms.admin();
      socket.join(room);

      const today = getHospitalDate();
      const [stats, simulator] = await Promise.all([
        buildAdminStats(today),
        Promise.resolve(getSimulatorStatus()),
      ]);
      ack(okAck(room, { stats, simulator }));
    } catch (err) {
      console.error('[socket] subscribe:admin error:', err.message);
      ack(errAck('INTERNAL', 'Internal server error'));
    }
  });

  // ── unsubscribe ────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.UNSUBSCRIBE, (payload, ack) => {
    const roomName = payload?.room;
    if (roomName) socket.leave(roomName);
    if (typeof ack === 'function') ack({ ok: true });
  });
}
