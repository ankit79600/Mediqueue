/**
 * simulator.service.js — in-process queue simulator (E23/E24, SOCKET_CONTRACT T8).
 *
 * Singleton state machine (one per Node process). Callers hold the io instance.
 * All queue mutations go through queue.service.js to honour locks and produce
 * correct changes objects for flush().
 *
 * Speed/rate maths:
 *   arrivalIntervalMs  = 60_000 / (speed × arrivalsPerMin)   [min 500 ms]
 *   actionIntervalMs   = 30_000 / speed                      [min 500 ms]
 *
 * At the defaults (speed=10, arrivalsPerMin=6):
 *   arrival every 1 s, staff action every 3 s.
 */

import prisma from '../db.js';
import { ActorType, ErrorCode } from '@mediqueue/shared';
import { AppError } from '../middleware/error.js';
import { getHospitalDate } from '../utils.js';
import { createToken, callNext, skipToken, noShow, completeToken } from './queue.service.js';
import { flush } from '../realtime/emitters.js';

// ─── STATE ────────────────────────────────────────────────────────────────────

// Error codes that are expected under simulator load — do not log these.
const SILENT_CODES = new Set([
  ErrorCode.ACTIVE_TOKEN_EXISTS,
  ErrorCode.QUEUE_EMPTY,
  ErrorCode.CONSULT_IN_PROGRESS,
  ErrorCode.INVALID_STATE,
  ErrorCode.NO_ACTIVE_DOCTOR,
  ErrorCode.DOCTOR_INACTIVE,
]);

const state = {
  running:          false,
  speed:            10,
  arrivalsPerMin:   6,
  startedAt:        null,
  tokensCreated:    0,
  actionsPerformed: 0,
  _timers:          [],
  _io:              null,
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function getStatus() {
  return {
    running:          state.running,
    speed:            state.speed,
    startedAt:        state.startedAt ? state.startedAt.toISOString() : null,
    tokensCreated:    state.tokensCreated,
    actionsPerformed: state.actionsPerformed,
  };
}

export function startSimulator(io, { speed = 10, arrivalsPerMin = 6 } = {}) {
  if (state.running) {
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Simulator is already running');
  }

  state.running          = true;
  state.speed            = speed;
  state.arrivalsPerMin   = arrivalsPerMin;
  state.startedAt        = new Date();
  state.tokensCreated    = 0;
  state.actionsPerformed = 0;
  state._io              = io;

  const arrivalMs = Math.max(500, Math.round(60_000 / (speed * arrivalsPerMin)));
  const actionMs  = Math.max(500, Math.round(30_000 / speed));

  state._timers.push(setInterval(_doArrival,     arrivalMs));
  state._timers.push(setInterval(_doStaffAction, actionMs));

  for (const t of state._timers) if (t.unref) t.unref();
}

export function stopSimulator() {
  if (!state.running) {
    throw new AppError(409, ErrorCode.INVALID_STATE, 'Simulator is not running');
  }
  _clearTimers();
  state.running = false;
  state._io     = null;
}

function _clearTimers() {
  for (const t of state._timers) clearInterval(t);
  state._timers = [];
}

// ─── ARRIVAL TICK ─────────────────────────────────────────────────────────────

async function _doArrival() {
  const io = state._io;
  if (!io) return;

  try {
    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    if (!doctors.length) return;

    const doctor = doctors[Math.floor(Math.random() * doctors.length)];

    // Pick one of the 40 synthetic patients at random
    const idx     = Math.floor(Math.random() * 40) + 1;
    const phone   = `90000000${String(idx).padStart(2, '0')}`;
    const patient = await prisma.patient.findUnique({ where: { phone } });
    if (!patient) return;

    const { changes } = await createToken(patient.id, {
      departmentId:     doctor.departmentId,
      doctorId:         doctor.id,
      type:             'LIVE',
      slotId:           null,
      priority:         'NONE', // createToken auto-applies ELDERLY from patient.age
      actorType:        ActorType.SIMULATOR,
      actorId:          null,
      skipProfileCheck: true,
    });

    state.tokensCreated++;
    flush(io, changes).catch(err => console.error('[sim:arrival] flush:', err.message));
  } catch (err) {
    if (!SILENT_CODES.has(err.code)) console.error('[sim:arrival]', err.message);
  }
}

// ─── STAFF ACTION TICK ────────────────────────────────────────────────────────

async function _doStaffAction() {
  const io = state._io;
  if (!io) return;

  try {
    const today   = getHospitalDate();
    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    if (!doctors.length) return;

    const doctor = doctors[Math.floor(Math.random() * doctors.length)];

    const [calledToken, waitingCount] = await Promise.all([
      prisma.token.findFirst({
        where:  { doctorId: doctor.id, serviceDate: today, status: 'CALLED' },
        select: { id: true },
      }),
      prisma.token.count({ where: { doctorId: doctor.id, serviceDate: today, status: 'WAITING' } }),
    ]);

    let changes;

    if (calledToken) {
      // 70 % complete, 20 % skip, 10 % no-show
      const rand = Math.random();
      if (rand < 0.70) {
        ({ changes } = await completeToken(calledToken.id, ActorType.SIMULATOR, null, null));
      } else if (rand < 0.90) {
        ({ changes } = await skipToken(calledToken.id, ActorType.SIMULATOR, null, null));
      } else {
        ({ changes } = await noShow(calledToken.id, ActorType.SIMULATOR, null, null));
      }
    } else if (waitingCount > 0) {
      ({ changes } = await callNext(doctor.id, ActorType.SIMULATOR, null));
    } else {
      return;
    }

    state.actionsPerformed++;
    flush(io, changes).catch(err => console.error('[sim:action] flush:', err.message));
  } catch (err) {
    if (!SILENT_CODES.has(err.code)) console.error('[sim:action]', err.message);
  }
}
