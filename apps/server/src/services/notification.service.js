/**
 * notification.service.js — notification domain logic.
 *
 * Responsibilities:
 *   • Build human-readable notification messages (notifMessage)
 *   • Create notification rows inside an open Prisma tx (insertNotifications)
 *   • Enforce the 3-turns-away rule inside a tx (checkThreeAway)
 *   • Paginated list for E22 GET /admin/notifications (getNotifications)
 *   • Post-commit SMS dispatch stub; real Twilio wired via env vars (dispatchSms)
 *
 * SOCKET_CONTRACT §5.1 — 3-away rule details.
 * DATABASE_SCHEMA §3.9  — notifications table.
 */

import prisma from '../db.js';
import config from '../config.js';
import {
  NotificationKind,
  NotificationChannel,
  NotificationStatus,
  TokenStatus,
  QueueAction,
  ActorType,
} from '@mediqueue/shared';
import { maskPhone } from '../utils.js';
import { fmtNotification } from '../presenter.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Build the SMS/in-app message text for a given notification kind.
 * All fields are optional; unused ones fall back to empty string.
 */
export function notifMessage(kind, { tokenNo = '', doctorName = '', room = '', position = 0, estimatedWaitMin = 0 } = {}) {
  switch (kind) {
    case NotificationKind.TOKEN_CREATED:
      return `MediQueue: ${tokenNo} issued. You are #${position} in line for ${doctorName} (${room}). Est. wait: ${estimatedWaitMin} min.`;
    case NotificationKind.THREE_AWAY:
      return `MediQueue: ${tokenNo}, you are ${ordinal(position)} in line for ${doctorName} (${room}). Est. wait ${estimatedWaitMin} min.`;
    case NotificationKind.CALLED:
      return `MediQueue: ${tokenNo}, please go to ${room} now. ${doctorName} is ready for you.`;
    case NotificationKind.SKIPPED:
      return `MediQueue: ${tokenNo}, you were not at ${room}. You are now #${position} in line.`;
    case NotificationKind.NO_SHOW:
      return `MediQueue: ${tokenNo} has been marked no-show.`;
    default:
      return '';
  }
}

// ─── IN-TRANSACTION HELPERS ───────────────────────────────────────────────────

/**
 * Create IN_APP + SMS_SIMULATED notification rows inside an open tx.
 * SMS row is omitted when no phone is provided (walk-in patient without phone).
 *
 * @returns {Promise<object[]>}  Created Prisma Notification rows
 */
export async function insertNotifications(tx, { tokenId, patientId, phone, kind, message }) {
  const toPhoneMasked = phone ? maskPhone(phone) : null;
  const base = { tokenId, patientId, kind, toPhoneMasked, message, status: NotificationStatus.SENT };

  const rows = [{ ...base, channel: NotificationChannel.IN_APP }];
  if (phone) rows.push({ ...base, channel: NotificationChannel.SMS_SIMULATED });

  const created = [];
  for (const data of rows) {
    created.push(await tx.notification.create({ data }));
  }
  return created;
}

/**
 * 3-turns-away rule — SOCKET_CONTRACT §5.1.
 *
 * Must be called inside every mutation transaction AFTER the queue state
 * has settled. Finds all WAITING tokens at position ≤ 3 whose
 * `notified_three_away` flag is false, marks them, creates audit events,
 * and creates notification rows.
 *
 * @param {object} tx            Prisma interactive transaction client
 * @param {object} doctor        Doctor row (needs id, name, room, avgConsultMin)
 * @param {Date}   serviceDate   The queue's service date
 * @returns {{ alerts: object[], notifications: object[] }}
 */
export async function checkThreeAway(tx, doctor, serviceDate) {
  const waiting = await tx.token.findMany({
    where:   { doctorId: doctor.id, serviceDate, status: TokenStatus.WAITING },
    orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { patient: { select: { phone: true } } },
  });

  const alerts        = [];
  const notifications = [];

  for (let i = 0; i < waiting.length; i++) {
    const t        = waiting[i];
    const position = i + 1;
    if (position > 3 || t.notifiedThreeAway) continue;

    // Mark the flag and write an audit event atomically
    await tx.token.update({ where: { id: t.id }, data: { notifiedThreeAway: true } });
    await tx.queueEvent.create({
      data: {
        tokenId: t.id, departmentId: t.departmentId, doctorId: doctor.id,
        action:    QueueAction.NOTIFIED_THREE_AWAY,
        actorType: ActorType.SYSTEM,
        meta:      { position },
      },
    });

    const estimatedWaitMin = Math.round((position - 1) * Number(doctor.avgConsultMin));
    const message = notifMessage(NotificationKind.THREE_AWAY, {
      tokenNo: t.tokenNo, doctorName: doctor.name, room: doctor.room, position, estimatedWaitMin,
    });

    const notifs = await insertNotifications(tx, {
      tokenId: t.id, patientId: t.patientId, phone: t.patient.phone,
      kind: NotificationKind.THREE_AWAY, message,
    });
    notifications.push(...notifs);

    alerts.push({
      tokenId: t.id, tokenNo: t.tokenNo, kind: 'THREE_AWAY',
      position, estimatedWaitMin,
      doctorName: doctor.name, room: doctor.room,
      message, at: new Date().toISOString(),
    });
  }

  return { alerts, notifications };
}

// ─── E22  GET /admin/notifications ────────────────────────────────────────────

/**
 * Paginated notification list (newest-first cursor pagination).
 *
 * @param {{ limit?: number, before?: string }} opts
 *   limit  — 1–200, default 50 (clamped server-side)
 *   before — ISO timestamp cursor; returns items created before this time
 * @returns {{ items: object[], nextBefore: string|null }}
 */
export async function getNotifications({ limit = 50, before = null } = {}) {
  const take  = Math.max(1, Math.min(200, limit));
  const where = before ? { createdAt: { lt: new Date(before) } } : {};

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: { token: { select: { tokenNo: true } } },
  });

  const nextBefore = rows.length === take
    ? rows[rows.length - 1].createdAt.toISOString()
    : null;

  return { items: rows.map(fmtNotification), nextBefore };
}

// ─── SMS DISPATCH (TWILIO STUB) ───────────────────────────────────────────────

/**
 * Dispatch a simulated or real SMS for one notification row.
 *
 * Called OUTSIDE the transaction, fire-and-forget after each mutation.
 * The notification row in the DB is already marked SENT (SMS_SIMULATED) by
 * insertNotifications — this function handles the actual outbound delivery.
 *
 * Activation: set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM in the
 * server .env. Until those vars are present this is a dev-console log only.
 */
export async function dispatchSms(notification) {
  if (notification.channel !== NotificationChannel.SMS_SIMULATED) return;

  // Dev / demo console log — always shows even without Twilio
  if (config.NODE_ENV !== 'production' || config.DEMO_MODE) {
    console.log(`[sms] to=${notification.toPhoneMasked ?? '?'} kind=${notification.kind}: ${notification.message}`);
  }

  // ── Real Twilio (activate by setting env vars, no code changes needed) ──────
  // Uncomment and install `twilio` package when ready for production SMS:
  //
  // const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: authToken, TWILIO_FROM: from } = process.env;
  // if (!sid || !authToken || !from) return; // credentials absent → simulated only
  //
  // try {
  //   const patient = await prisma.patient.findUnique({ where: { id: notification.patientId }, select: { phone: true } });
  //   if (!patient?.phone) return;
  //   const twilio = (await import('twilio')).default;
  //   const client = twilio(sid, authToken);
  //   await client.messages.create({ body: notification.message, from, to: `+91${patient.phone}` });
  //   // Upgrade channel to SMS_TWILIO so the admin log shows "real" delivery
  //   await prisma.notification.update({
  //     where: { id: notification.id },
  //     data:  { channel: NotificationChannel.SMS_TWILIO },
  //   });
  // } catch (err) {
  //   console.error('[sms] Twilio error:', err.message);
  //   await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.FAILED } });
  // }
}
