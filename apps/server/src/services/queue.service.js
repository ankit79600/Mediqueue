/**
 * queue.service.js — all queue state mutations.
 *
 * Every exported function runs inside ONE Prisma interactive transaction.
 * The first statement in each tx is `SELECT … FOR UPDATE` on the doctor row,
 * which serialises all mutations per doctor (DATABASE_SCHEMA §6).
 *
 * Return shape: { token, changes }   (and { result } for skipToken)
 *
 * `changes` is consumed by emitters.flush(io, changes) (A7).
 * Shape: { doctorId, departmentId, called, skipped, ended[], alerts[], notifications[] }
 */

import prisma from '../db.js';
import { AppError } from '../middleware/error.js';
import {
  ErrorCode,
  TokenStatus,
  QueueAction,
  ActorType,
  Priority,
  NotificationKind,
} from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { notifMessage, insertNotifications, checkThreeAway } from './notification.service.js';

// Re-export so route handlers have a single import point for the date helper.
export { getHospitalDate };

// ─── SORT KEY (private) ───────────────────────────────────────────────────────

function calcSortKey(base, priority) {
  // DATABASE_SCHEMA §4.2 — base is a Date or already-BigInt epoch ms
  const b = BigInt(base instanceof Date ? base.getTime() : Number(base));
  if (priority === Priority.EMERGENCY)                             return b - BigInt(86_400_000);
  if (priority === Priority.ELDERLY || priority === Priority.PREGNANT) return b - BigInt(900_000);
  return b;
}

function calcSkipSortKey(waiting) {
  // DATABASE_SCHEMA §4.2 skip rule — waiting is ordered WAITING tokens, excluding the skipped one
  if (waiting.length >= 3) return waiting[2].sortKey + 1n;
  if (waiting.length > 0)  return waiting[waiting.length - 1].sortKey + 1n;
  return BigInt(Date.now());
}

// ─── E9 / E15  createToken ────────────────────────────────────────────────────

export async function createToken(patientId, {
  departmentId, doctorId: requestedDoctorId, type, slotId, priority = Priority.NONE,
  actorType = ActorType.PATIENT, actorId,
  skipProfileCheck = false,
}) {
  const today = getHospitalDate();

  // ── Patient + profile check ──────────────────────────────────────────────────
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Patient not found');

  if (!skipProfileCheck && (!patient.name || patient.age == null || !patient.consentAt)) {
    throw new AppError(403, ErrorCode.PROFILE_INCOMPLETE, 'Complete your profile before joining the queue');
  }

  // ── Auto-apply ELDERLY (DATABASE_SCHEMA §4.2) ────────────────────────────────
  let resolvedPriority = priority;
  if (resolvedPriority === Priority.NONE && patient.age != null && patient.age >= 60) {
    resolvedPriority = Priority.ELDERLY;
  }

  // ── Department ───────────────────────────────────────────────────────────────
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw new AppError(404, ErrorCode.DEPARTMENT_NOT_FOUND, 'Department not found');

  // ── Doctor (or auto-assign) ───────────────────────────────────────────────────
  let doctor;
  if (requestedDoctorId) {
    doctor = await prisma.doctor.findUnique({ where: { id: requestedDoctorId } });
    if (!doctor) throw new AppError(404, ErrorCode.DOCTOR_NOT_FOUND, 'Doctor not found');
    if (doctor.departmentId !== departmentId)
      throw new AppError(422, ErrorCode.DOCTOR_DEPARTMENT_MISMATCH, 'Doctor does not belong to this department');
    if (!doctor.isActive)
      throw new AppError(422, ErrorCode.DOCTOR_INACTIVE, 'Doctor is not currently active');
  } else {
    // Fewest WAITING today → lowest avgConsultMin as tie-breaker
    const candidates = await prisma.doctor.findMany({
      where: { departmentId, isActive: true },
      include: {
        _count: { select: { tokens: { where: { status: TokenStatus.WAITING, serviceDate: today } } } },
      },
    });
    if (candidates.length === 0)
      throw new AppError(422, ErrorCode.NO_ACTIVE_DOCTOR, 'No active doctor available in this department');

    candidates.sort((a, b) => {
      const diff = a._count.tokens - b._count.tokens;
      return diff !== 0 ? diff : Number(a.avgConsultMin) - Number(b.avgConsultMin);
    });
    // Strip the _count helper before using as doctor
    const { _count: _ignored, ...rest } = candidates[0];
    doctor = rest;
  }

  // ── Slot (SLOT type only) ─────────────────────────────────────────────────────
  let slot = null;
  if (type === 'SLOT') {
    if (!slotId) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'slotId is required for SLOT type', { fields: { slotId: 'Required for SLOT type' } });
    slot = await prisma.slot.findUnique({ where: { id: slotId } });
    if (!slot || slot.doctorId !== doctor.id)
      throw new AppError(404, ErrorCode.SLOT_NOT_FOUND, 'Slot not found');
    if (slot.startTime <= new Date())
      throw new AppError(409, ErrorCode.SLOT_IN_PAST, 'This slot has already started');
    // Full check is enforced atomically inside the tx; this is an early exit for the obvious case
    if (slot.bookedCount >= slot.capacity)
      throw new AppError(409, ErrorCode.SLOT_FULL, 'This slot is fully booked');
  }

  // ── Transaction ───────────────────────────────────────────────────────────────
  let token, alerts, notifications;
  try {
    ({ token, alerts, notifications } = await prisma.$transaction(async (tx) => {
      // Lock doctor row — serialises all queue mutations for this doctor
      await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${doctor.id}::uuid FOR UPDATE`;

      // Re-fetch doctor for fresh avgConsultMin after lock
      const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: doctor.id } });

      // Existing active token guard (explicit check for clean error message)
      const existing = await tx.token.findFirst({
        where: {
          patientId, departmentId, serviceDate: today,
          status: { in: [TokenStatus.WAITING, TokenStatus.CALLED] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new AppError(409, ErrorCode.ACTIVE_TOKEN_EXISTS,
          'You already have an active token in this department today', { tokenId: existing.id });
      }

      // Slot: increment booked_count atomically (0 rows → full)
      if (type === 'SLOT') {
        const updated = await tx.slot.updateMany({
          where: { id: slotId, bookedCount: { lt: slot.capacity } },
          data: { bookedCount: { increment: 1 } },
        });
        if (updated.count === 0)
          throw new AppError(409, ErrorCode.SLOT_FULL, 'This slot is fully booked');
      }

      // Sequence counter upsert (DATABASE_SCHEMA §3.8)
      const rows = await tx.$queryRaw`
        INSERT INTO dept_daily_counters (department_id, service_date, last_seq)
        VALUES (${departmentId}::uuid, ${today}::date, 1)
        ON CONFLICT (department_id, service_date)
        DO UPDATE SET last_seq = dept_daily_counters.last_seq + 1
        RETURNING last_seq
      `;
      const seq = Number(rows[0].last_seq);
      const tokenNo = `${department.code}-${String(seq).padStart(3, '0')}`;

      // Sort key
      const base = type === 'SLOT' ? slot.startTime : new Date();
      const sortKey = calcSortKey(base, resolvedPriority);

      // Create token
      const newToken = await tx.token.create({
        data: {
          patientId, departmentId,
          doctorId: freshDoctor.id,
          slotId: slotId ?? null,
          serviceDate: today,
          tokenSeq: seq, tokenNo,
          type, priority: resolvedPriority,
          status: TokenStatus.WAITING,
          sortKey,
          slotTime: slot?.startTime ?? null,
        },
      });

      // Audit event
      await tx.queueEvent.create({
        data: {
          tokenId: newToken.id, departmentId, doctorId: freshDoctor.id,
          action: QueueAction.CREATED, actorType, actorId: actorId ?? null,
        },
      });

      // Position of new token
      const waitingOrder = await tx.token.findMany({
        where: { doctorId: freshDoctor.id, serviceDate: today, status: TokenStatus.WAITING },
        orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const position = waitingOrder.findIndex(t => t.id === newToken.id) + 1;
      const estimatedWaitMin = Math.round((position - 1) * Number(freshDoctor.avgConsultMin));

      const createdMsg = notifMessage(NotificationKind.TOKEN_CREATED, {
        tokenNo, doctorName: freshDoctor.name, room: freshDoctor.room, position, estimatedWaitMin,
      });
      const createdNotifs = await insertNotifications(tx, {
        tokenId: newToken.id, patientId, phone: patient.phone,
        kind: NotificationKind.TOKEN_CREATED, message: createdMsg,
      });

      // 3-away rule (new token or priority shift may push existing tokens ≤ position 3)
      const { alerts: threeAlerts, notifications: threeNotifs } = await checkThreeAway(
        tx, freshDoctor, today,
      );

      return {
        token: newToken,
        alerts: threeAlerts,
        notifications: [...createdNotifs, ...threeNotifs],
      };
    }));
  } catch (err) {
    // Unique index on (patient_id, department_id, service_date) WHERE WAITING/CALLED
    if (err?.code === 'P2002') {
      throw new AppError(409, ErrorCode.ACTIVE_TOKEN_EXISTS,
        'You already have an active token in this department today');
    }
    throw err;
  }

  return {
    token,
    changes: {
      doctorId: doctor.id, departmentId,
      called: null, skipped: null,
      ended: [], alerts, notifications,
    },
  };
}

// ─── E12  cancelToken ─────────────────────────────────────────────────────────

export async function cancelToken(tokenId, patientId) {
  // Fetch token outside tx for early validation
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: { department: { select: { code: true } } },
  });
  if (!token) throw new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found');

  // Ownership — patient may only cancel their own tokens
  if (token.patientId !== patientId)
    throw new AppError(403, ErrorCode.FORBIDDEN, 'You can only cancel your own tokens');
  if (token.status !== TokenStatus.WAITING)
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Only WAITING tokens can be cancelled', { status: token.status });

  const { updatedToken, alerts, notifications } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${token.doctorId}::uuid FOR UPDATE`;
    const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: token.doctorId } });

    const endedAt = new Date();
    const cancelled = await tx.token.update({
      where: { id: tokenId },
      data: { status: TokenStatus.CANCELLED, endedAt },
    });

    // Decrement slot.booked_count if SLOT type
    if (token.type === 'SLOT' && token.slotId) {
      await tx.slot.update({
        where: { id: token.slotId },
        data: { bookedCount: { decrement: 1 } },
      });
    }

    await tx.queueEvent.create({
      data: {
        tokenId, departmentId: token.departmentId, doctorId: token.doctorId,
        action: QueueAction.CANCELLED, actorType: ActorType.PATIENT, actorId: patientId,
      },
    });

    // Cancellation may shift others ≤ 3 positions
    const { alerts: threeAlerts, notifications: threeNotifs } =
      await checkThreeAway(tx, freshDoctor, token.serviceDate);

    return { updatedToken: cancelled, alerts: threeAlerts, notifications: threeNotifs };
  });

  return {
    token: updatedToken,
    changes: {
      doctorId: token.doctorId, departmentId: token.departmentId,
      called: null, skipped: null,
      ended: [{ tokenId, tokenNo: token.tokenNo, status: TokenStatus.CANCELLED, endedAt: updatedToken.endedAt.toISOString() }],
      alerts, notifications,
    },
  };
}

// ─── E17  callNext ────────────────────────────────────────────────────────────

export async function callNext(doctorId, actorType, actorId) {
  // Validate doctor exists
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) throw new AppError(404, ErrorCode.DOCTOR_NOT_FOUND, 'Doctor not found');

  const today = getHospitalDate();

  let calledToken, alerts, notifications;

  ({ calledToken, alerts, notifications } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${doctorId}::uuid FOR UPDATE`;
    const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: doctorId } });

    // Guard: one consultation at a time
    const current = await tx.token.findFirst({
      where: { doctorId, serviceDate: today, status: TokenStatus.CALLED },
      select: { id: true },
    });
    if (current) {
      throw new AppError(409, ErrorCode.CONSULT_IN_PROGRESS,
        'A consultation is already in progress', { tokenId: current.id });
    }

    // Next WAITING token by queue order
    const next = await tx.token.findFirst({
      where: { doctorId, serviceDate: today, status: TokenStatus.WAITING },
      orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: { patient: { select: { phone: true } } },
    });
    if (!next) throw new AppError(409, ErrorCode.QUEUE_EMPTY, 'No waiting tokens for this doctor');

    const calledAt = new Date();
    const called = await tx.token.update({
      where: { id: next.id },
      data: { status: TokenStatus.CALLED, calledAt },
    });

    await tx.queueEvent.create({
      data: {
        tokenId: next.id, departmentId: next.departmentId, doctorId,
        action: QueueAction.CALLED, actorType, actorId,
      },
    });

    // CALLED notification
    const calledMsg = notifMessage(NotificationKind.CALLED, {
      tokenNo: next.tokenNo, doctorName: freshDoctor.name, room: freshDoctor.room,
    });
    const calledNotifs = await insertNotifications(tx, {
      tokenId: next.id, patientId: next.patientId, phone: next.patient.phone,
      kind: NotificationKind.CALLED, message: calledMsg,
    });

    // 3-away for remaining WAITING
    const { alerts: threeAlerts, notifications: threeNotifs } =
      await checkThreeAway(tx, freshDoctor, today);

    return {
      calledToken: called,
      alerts: threeAlerts,
      notifications: [...calledNotifs, ...threeNotifs],
    };
  }));

  const calledPayload = {
    tokenId: calledToken.id, tokenNo: calledToken.tokenNo,
    doctorName: doctor.name, room: doctor.room,
    calledAt: calledToken.calledAt.toISOString(),
  };

  return {
    token: calledToken,
    changes: {
      doctorId, departmentId: doctor.departmentId,
      called: calledPayload, skipped: null,
      ended: [], alerts, notifications,
    },
  };
}

// ─── E18  skipToken ───────────────────────────────────────────────────────────

export async function skipToken(tokenId, actorType, actorId, callerDoctorId = null) {
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found');

  // Ownership: STAFF may only act on their own doctor's tokens
  if (callerDoctorId && token.doctorId !== callerDoctorId)
    throw new AppError(403, ErrorCode.FORBIDDEN, "You can only act on your doctor's queue");
  if (token.status !== TokenStatus.CALLED)
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Only CALLED tokens can be skipped', { status: token.status });

  let updatedToken, result, alerts, notifications, skippedPayload;

  ({ updatedToken, result, alerts, notifications, skippedPayload } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${token.doctorId}::uuid FOR UPDATE`;
    const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: token.doctorId } });
    const patient = await tx.patient.findUnique({
      where: { id: token.patientId }, select: { phone: true },
    });

    if (token.skipCount >= 1) {
      // ── Second skip → NO_SHOW ─────────────────────────────────────────────────
      const endedAt = new Date();
      const ended = await tx.token.update({
        where: { id: tokenId },
        data: { status: TokenStatus.NO_SHOW, endedAt },
      });

      await tx.queueEvent.create({
        data: {
          tokenId, departmentId: token.departmentId, doctorId: token.doctorId,
          action: QueueAction.NO_SHOW, actorType, actorId,
          meta: { reason: 'second_skip' },
        },
      });

      const noShowMsg = notifMessage(NotificationKind.NO_SHOW, { tokenNo: token.tokenNo });
      const noShowNotifs = await insertNotifications(tx, {
        tokenId, patientId: token.patientId, phone: patient?.phone,
        kind: NotificationKind.NO_SHOW, message: noShowMsg,
      });

      const { alerts: threeAlerts, notifications: threeNotifs } =
        await checkThreeAway(tx, freshDoctor, token.serviceDate);

      return {
        updatedToken: ended,
        result: 'NO_SHOW',
        alerts: threeAlerts,
        notifications: [...noShowNotifs, ...threeNotifs],
        skippedPayload: {
          tokenId, tokenNo: token.tokenNo, result: 'NO_SHOW',
          position: null, skipCount: 2, message: noShowMsg, at: endedAt.toISOString(),
        },
      };
    }

    // ── First skip → re-queue behind 3 people ─────────────────────────────────
    const waiting = await tx.token.findMany({
      where: { doctorId: token.doctorId, serviceDate: token.serviceDate, status: TokenStatus.WAITING },
      orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, sortKey: true },
    });
    const newSortKey = calcSkipSortKey(waiting);

    const requeued = await tx.token.update({
      where: { id: tokenId },
      data: { status: TokenStatus.WAITING, skipCount: 1, sortKey: newSortKey, calledAt: null },
    });

    await tx.queueEvent.create({
      data: {
        tokenId, departmentId: token.departmentId, doctorId: token.doctorId,
        action: QueueAction.SKIPPED, actorType, actorId,
      },
    });

    // Position after re-queue
    const updatedWaiting = await tx.token.findMany({
      where: { doctorId: token.doctorId, serviceDate: token.serviceDate, status: TokenStatus.WAITING },
      orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const newPosition = updatedWaiting.findIndex(t => t.id === tokenId) + 1;

    const skippedMsg = notifMessage(NotificationKind.SKIPPED, {
      tokenNo: token.tokenNo, room: freshDoctor.room, position: newPosition,
    });
    const skippedNotifs = await insertNotifications(tx, {
      tokenId, patientId: token.patientId, phone: patient?.phone,
      kind: NotificationKind.SKIPPED, message: skippedMsg,
    });

    const { alerts: threeAlerts, notifications: threeNotifs } =
      await checkThreeAway(tx, freshDoctor, token.serviceDate);

    return {
      updatedToken: requeued,
      result: 'REQUEUED',
      alerts: threeAlerts,
      notifications: [...skippedNotifs, ...threeNotifs],
      skippedPayload: {
        tokenId, tokenNo: token.tokenNo, result: 'REQUEUED',
        position: newPosition, skipCount: 1, message: skippedMsg, at: new Date().toISOString(),
      },
    };
  }));

  return {
    token: updatedToken,
    result,
    changes: {
      doctorId: token.doctorId, departmentId: token.departmentId,
      called: null, skipped: skippedPayload,
      ended: result === 'NO_SHOW'
        ? [{ tokenId, tokenNo: token.tokenNo, status: TokenStatus.NO_SHOW, endedAt: updatedToken.endedAt?.toISOString() }]
        : [],
      alerts, notifications,
    },
  };
}

// ─── E19  noShow ──────────────────────────────────────────────────────────────

export async function noShow(tokenId, actorType, actorId, callerDoctorId = null) {
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found');

  if (callerDoctorId && token.doctorId !== callerDoctorId)
    throw new AppError(403, ErrorCode.FORBIDDEN, "You can only act on your doctor's queue");
  if (token.status !== TokenStatus.CALLED)
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Only CALLED tokens can be marked no-show', { status: token.status });

  let updatedToken, alerts, notifications;

  ({ updatedToken, alerts, notifications } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${token.doctorId}::uuid FOR UPDATE`;
    const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: token.doctorId } });
    const patient = await tx.patient.findUnique({
      where: { id: token.patientId }, select: { phone: true },
    });

    const endedAt = new Date();
    const ended = await tx.token.update({
      where: { id: tokenId },
      data: { status: TokenStatus.NO_SHOW, endedAt },
    });

    await tx.queueEvent.create({
      data: {
        tokenId, departmentId: token.departmentId, doctorId: token.doctorId,
        action: QueueAction.NO_SHOW, actorType, actorId,
      },
    });

    const msg = notifMessage(NotificationKind.NO_SHOW, { tokenNo: token.tokenNo });
    const notifs = await insertNotifications(tx, {
      tokenId, patientId: token.patientId, phone: patient?.phone,
      kind: NotificationKind.NO_SHOW, message: msg,
    });

    const { alerts: threeAlerts, notifications: threeNotifs } =
      await checkThreeAway(tx, freshDoctor, token.serviceDate);

    return {
      updatedToken: ended,
      alerts: threeAlerts,
      notifications: [...notifs, ...threeNotifs],
    };
  }));

  return {
    token: updatedToken,
    changes: {
      doctorId: token.doctorId, departmentId: token.departmentId,
      called: null, skipped: null,
      ended: [{ tokenId, tokenNo: token.tokenNo, status: TokenStatus.NO_SHOW, endedAt: updatedToken.endedAt.toISOString() }],
      alerts, notifications,
    },
  };
}

// ─── E20  completeToken ───────────────────────────────────────────────────────

export async function completeToken(tokenId, actorType, actorId, callerDoctorId = null) {
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found');

  if (callerDoctorId && token.doctorId !== callerDoctorId)
    throw new AppError(403, ErrorCode.FORBIDDEN, "You can only act on your doctor's queue");
  if (token.status !== TokenStatus.CALLED)
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Only CALLED tokens can be completed', { status: token.status });
  if (!token.calledAt)
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Token has no calledAt timestamp');

  let updatedToken, alerts;

  ({ updatedToken, alerts } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM doctors WHERE id = ${token.doctorId}::uuid FOR UPDATE`;
    const freshDoctor = await tx.doctor.findUniqueOrThrow({ where: { id: token.doctorId } });

    const endedAt = new Date();
    const consultMin = (endedAt.getTime() - token.calledAt.getTime()) / 60_000;
    const oldAvg = Number(freshDoctor.avgConsultMin);
    // EWMA: α = 0.2, clamp [2, 30] (DATABASE_SCHEMA §3.2)
    const newAvg = Math.max(2, Math.min(30, 0.8 * oldAvg + 0.2 * consultMin));

    const completed = await tx.token.update({
      where: { id: tokenId },
      data: { status: TokenStatus.COMPLETED, endedAt },
    });

    await tx.doctor.update({
      where: { id: token.doctorId },
      data: { avgConsultMin: newAvg },
    });

    await tx.queueEvent.create({
      data: {
        tokenId, departmentId: token.departmentId, doctorId: token.doctorId,
        action: QueueAction.COMPLETED, actorType, actorId,
        meta: { consultMin: parseFloat(consultMin.toFixed(2)) },
      },
    });

    // Completion shifts ETA for all WAITING — also check 3-away with updated avgConsultMin
    const updatedDoctor = { ...freshDoctor, avgConsultMin: newAvg };
    const { alerts: threeAlerts } = await checkThreeAway(tx, updatedDoctor, token.serviceDate);

    return { updatedToken: completed, alerts: threeAlerts };
  }));

  return {
    token: updatedToken,
    changes: {
      doctorId: token.doctorId, departmentId: token.departmentId,
      called: null, skipped: null,
      ended: [{ tokenId, tokenNo: token.tokenNo, status: TokenStatus.COMPLETED, endedAt: updatedToken.endedAt.toISOString() }],
      alerts, notifications: [],
    },
  };
}
