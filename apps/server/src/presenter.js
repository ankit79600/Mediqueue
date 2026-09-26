/**
 * presenter.js — pure transform functions from Prisma rows → API contract shapes.
 *
 * No DB access, no side effects.  Each function takes raw Prisma rows + any
 * pre-computed derived values and returns the exact JSON shape from API_CONTRACT §2.
 *
 * SOCKET_CONTRACT §7: REST and socket payloads use the same functions.
 *
 * Token queries must be made with TOKEN_INCLUDE (from eta.service.js) before
 * passing to fmtToken / fmtTokenPublic.
 */

import crypto from 'crypto';
import config from './config.js';
import { maskPhone } from './utils.js';

// ─── QR / TRACKING URL ────────────────────────────────────────────────────────

function buildSig(tokenId) {
  // API_CONTRACT §2.6: first 16 hex chars of HMAC_SHA256(QR_SECRET, tokenId)
  return crypto
    .createHmac('sha256', config.QR_SECRET)
    .update(tokenId)
    .digest('hex')
    .slice(0, 16);
}

export function buildTrackUrl(tokenId) {
  return `${config.PUBLIC_WEB_URL}/t/${tokenId}?s=${buildSig(tokenId)}`;
}

export function verifyTokenSig(tokenId, sig) {
  if (!sig || sig.length !== 16) return false;
  const expected = buildSig(tokenId);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function iso(d)  { return d ? new Date(d).toISOString() : null; }
function date(d) { return d ? new Date(d).toISOString().slice(0, 10) : null; } // YYYY-MM-DD

// ─── §2.1  Patient ────────────────────────────────────────────────────────────

export function fmtPatient(p) {
  return {
    id:              p.id,
    phone:           p.phone           ?? null,
    phoneMasked:     maskPhone(p.phone),
    name:            p.name            ?? null,
    age:             p.age             ?? null,
    gender:          p.gender          ?? null,
    consentAt:       iso(p.consentAt),
    profileComplete: !!(p.name && p.age != null && p.consentAt),
  };
}

// ─── §2.4  Slot ───────────────────────────────────────────────────────────────

export function fmtSlot(slot) {
  return {
    id:          slot.id,
    startTime:   iso(slot.startTime),
    endTime:     iso(slot.endTime),
    capacity:    slot.capacity,
    bookedCount: slot.bookedCount,
    available:   slot.bookedCount < slot.capacity && new Date(slot.startTime) > new Date(),
  };
}

// ─── §2.5  TokenPublic ───────────────────────────────────────────────────────
//
// token must be fetched with TOKEN_INCLUDE (from eta.service.js).
// etaResult = { position, peopleAhead, estimatedWaitMin, estimatedCallAt, etaSource }
//            or null for non-WAITING tokens.
//
// API contract:
//   WAITING → use etaResult values
//   CALLED  → position = 0, others null
//   else    → all null

export function fmtTokenPublic(token, etaResult = null) {
  const isWaiting = token.status === 'WAITING';
  const isCalled  = token.status === 'CALLED';

  const position          = isWaiting ? (etaResult?.position         ?? null) : isCalled ? 0 : null;
  const peopleAhead       = isWaiting ? (etaResult?.peopleAhead      ?? null) : null;
  const estimatedWaitMin  = isWaiting ? (etaResult?.estimatedWaitMin ?? null) : null;
  const estimatedCallAt   = isWaiting ? (iso(etaResult?.estimatedCallAt) ?? null) : null;

  return {
    id:               token.id,
    tokenNo:          token.tokenNo,
    status:           token.status,
    priority:         token.priority,
    departmentName:   token.department.name,
    doctorName:       token.doctor.name,
    room:             token.doctor.room,
    position,
    peopleAhead,
    estimatedWaitMin,
    estimatedCallAt,
    updatedAt:        iso(token.updatedAt),
  };
}

// ─── §2.6  Token (full) ───────────────────────────────────────────────────────

export function fmtToken(token, etaResult = null) {
  const pub = fmtTokenPublic(token, etaResult);
  const trackUrl = buildTrackUrl(token.id);

  return {
    ...pub,
    // Additional full-token fields
    type:             token.type,
    departmentId:     token.departmentId,
    doctorId:         token.doctorId,
    slotId:           token.slotId   ?? null,
    slotTime:         iso(token.slotTime),
    serviceDate:      date(token.serviceDate),
    patient: {
      id:          token.patient.id,
      name:        token.patient.name  ?? null,
      phoneMasked: maskPhone(token.patient.phone),
      age:         token.patient.age   ?? null,
    },
    createdAt:        iso(token.createdAt),
    calledAt:         iso(token.calledAt),
    endedAt:          iso(token.endedAt),
    skipCount:        token.skipCount,
    notifiedThreeAway: token.notifiedThreeAway,
    etaSource:        etaResult?.etaSource ?? 'AVG',
    trackUrl,
    qrPayload:        trackUrl,
  };
}

// ─── §2.2  Doctor ─────────────────────────────────────────────────────────────
//
// queueLength    — count of WAITING tokens for this doctor today
// currentTokenNo — tokenNo of the CALLED token, or null

export function fmtDoctor(doctor, { queueLength = 0, currentTokenNo = null } = {}) {
  return {
    id:             doctor.id,
    departmentId:   doctor.departmentId,
    name:           doctor.name,
    room:           doctor.room,
    isActive:       doctor.isActive,
    avgConsultMin:  Number(doctor.avgConsultMin),
    queueLength,
    currentTokenNo,
  };
}

// ─── §2.3  Department ─────────────────────────────────────────────────────────
//
// queueLength       — count WAITING today across all doctors
// estimatedWaitMin  — wait for a new LIVE token on auto-assigned doctor
// doctors           — already-formatted Doctor[] (from fmtDoctor)

export function fmtDepartment(dept, { queueLength = 0, estimatedWaitMin = 0, doctors = [] } = {}) {
  return {
    id:               dept.id,
    name:             dept.name,
    code:             dept.code,
    queueLength,
    estimatedWaitMin,
    doctors,
  };
}

// ─── §2.7  QueueSnapshot ─────────────────────────────────────────────────────
//
// All Token arguments must already be formatted with fmtToken.
//
// doctorShape  — fmtDoctor() output
// deptBrief    — { id, name, code }
// current      — fmtToken() output (CALLED token) | null
// waiting      — fmtToken() output[] in queue order, position 1..n
// stats        — { servedToday, noShowToday }  (counts from DB)

export function fmtQueueSnapshot(doctorShape, deptBrief, current, waiting, stats) {
  return {
    doctor:     doctorShape,
    department: deptBrief,
    current,
    waiting,
    stats: {
      servedToday:   stats.servedToday,
      noShowToday:   stats.noShowToday,
      waitingCount:  waiting.length,
      avgConsultMin: doctorShape.avgConsultMin,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── §2.8  DisplaySnapshot ───────────────────────────────────────────────────
//
// nowServing  — [{ doctorId, doctorName, room, tokenNo }]  one entry per doctor
// upNext      — [{ tokenNo, doctorName, room, priority }]  max 5, pre-sorted by estimatedCallAt
// queueLength — total WAITING in this department today

export function fmtDisplaySnapshot(dept, nowServing, upNext, queueLength) {
  return {
    department: { id: dept.id, name: dept.name, code: dept.code },
    nowServing,
    upNext: upNext.slice(0, 5),
    queueLength,
    generatedAt: new Date().toISOString(),
  };
}

// ─── §2.10  Notification ─────────────────────────────────────────────────────

export function fmtNotification(n) {
  return {
    id:             n.id,
    tokenId:        n.tokenId,
    tokenNo:        n.token?.tokenNo ?? null,
    kind:           n.kind,
    channel:        n.channel,
    toPhoneMasked:  n.toPhoneMasked  ?? null,
    message:        n.message,
    status:         n.status,
    createdAt:      iso(n.createdAt),
  };
}

// ─── HELPERS USED BY ROUTE HANDLERS ──────────────────────────────────────────

/**
 * Build the Department shape for E7 (GET /departments).
 * Fetches live stats from the provided pre-loaded data.
 *
 * @param {object}   dept           Prisma Department row
 * @param {object[]} doctors        Prisma Doctor[] for this dept (with TOKEN_INCLUDE-style data)
 * @param {object[]} allWaiting     All WAITING tokens for this dept today
 * @param {Map}      etasByDoctor   Map<doctorId, { waiting, called, etaMap }>
 */
export function buildDepartmentShape(dept, doctors, allWaiting, etasByDoctor) {
  const formattedDoctors = doctors.map(d => {
    const ctx  = etasByDoctor.get(d.id) ?? { waiting: [], called: null };
    return fmtDoctor(d, {
      queueLength:    ctx.waiting.length,
      currentTokenNo: ctx.called?.tokenNo ?? null,
    });
  });

  // estimatedWaitMin for a new LIVE token = ETA for the auto-assign doctor
  // (doctor with fewest WAITING; same tie-break as createToken)
  const sorted = [...doctors].sort((a, b) => {
    const ctxA = etasByDoctor.get(a.id) ?? { waiting: [] };
    const ctxB = etasByDoctor.get(b.id) ?? { waiting: [] };
    const diff = ctxA.waiting.length - ctxB.waiting.length;
    return diff !== 0 ? diff : Number(a.avgConsultMin) - Number(b.avgConsultMin);
  });
  const autoDoc   = sorted[0];
  const autoCtx   = autoDoc ? (etasByDoctor.get(autoDoc.id) ?? { waiting: [], called: null }) : null;
  const autoWait  = autoCtx?.waiting ?? [];
  const autoCalled = autoCtx?.called ?? null;

  // New token would go at the end (no priority bump) — position = autoWait.length + 1
  const peopleAhead     = autoWait.length;
  const remainingMin    = autoCalled?.calledAt
    ? Math.max(1, Number(autoDoc.avgConsultMin) - (Date.now() - new Date(autoCalled.calledAt).getTime()) / 60_000)
    : 0;
  const estimatedWaitMin = autoDoc
    ? Math.round(remainingMin + peopleAhead * Number(autoDoc.avgConsultMin))
    : 0;

  return fmtDepartment(dept, {
    queueLength: allWaiting.length,
    estimatedWaitMin,
    doctors: formattedDoctors,
  });
}
