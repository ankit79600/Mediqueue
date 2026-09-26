/**
 * eta.service.js — queue position and wait-time calculations.
 *
 * computeEta()        — pure function, no DB access
 * buildDoctorContext()— DB helper: fetch doctor + WAITING + CALLED tokens
 *
 * A12 (bonus): if apps/server/model.json exists and is valid, ETAs use the
 * loaded linear regression model (etaSource: 'MODEL'). Falls back to the
 * simple average formula (etaSource: 'AVG') when the file is absent or malformed.
 * Override the path with MODEL_JSON_PATH env var.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import prisma from '../db.js';
import { getHospitalDate } from '../utils.js';
import { TokenStatus } from '@mediqueue/shared';

// ─── ML MODEL LOADER (A12) ────────────────────────────────────────────────────

const _modelPath = process.env.MODEL_JSON_PATH
  ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../model.json');

let _model = null;
try {
  const parsed = JSON.parse(readFileSync(_modelPath, 'utf8'));
  if (
    typeof parsed.intercept === 'number' &&
    parsed.coefficients != null &&
    typeof parsed.coefficients === 'object'
  ) {
    _model = parsed;
    console.log(`[INFO] ML ETA model loaded  source=${_modelPath}`);
  }
} catch {
  // file absent or malformed — AVG fallback stays active
}

function _predictWaitMin(model, features) {
  let result = model.intercept;
  for (const [key, coeff] of Object.entries(model.coefficients)) {
    result += coeff * (features[key] ?? 0);
  }
  return Math.max(0, Math.round(result));
}

// ─── TOKEN INCLUDE ────────────────────────────────────────────────────────────
// Standard Prisma include for any token query whose result will be passed to
// presenter.fmtToken / fmtTokenPublic.  Import and spread this in route handlers.

export const TOKEN_INCLUDE = Object.freeze({
  patient:    { select: { id: true, name: true, age: true, phone: true } },
  doctor:     { select: { name: true, room: true } },
  department: { select: { name: true } },
});

// ─── PURE ETA CALCULATION ─────────────────────────────────────────────────────

/**
 * Compute position + ETA for one WAITING token.
 *
 * @param {object}   doctor        Prisma Doctor row (needs avgConsultMin)
 * @param {object[]} waitingTokens Ordered WAITING tokens for this doctor
 *                                 (sort_key ASC, created_at ASC, id ASC).
 * @param {object|null} calledToken Current CALLED token (for remainingCurrentMin), or null.
 * @param {object}   targetToken   The token being estimated (must be in waitingTokens).
 *
 * @returns {{ position, peopleAhead, estimatedWaitMin, estimatedCallAt, etaSource }}
 *          null if targetToken is not found in waitingTokens.
 */
export function computeEta(doctor, waitingTokens, calledToken, targetToken) {
  const avgConsult = Number(doctor.avgConsultMin);
  const idx = waitingTokens.findIndex(t => t.id === targetToken.id);
  if (idx < 0) return null;

  const position    = idx + 1;
  const peopleAhead = idx;

  // remainingCurrentMin (DATABASE_SCHEMA §4.3)
  let remainingCurrentMin = 0;
  if (calledToken?.calledAt) {
    const elapsedMin = (Date.now() - new Date(calledToken.calledAt).getTime()) / 60_000;
    remainingCurrentMin = Math.max(1, avgConsult - elapsedMin);
  }

  // AVG baseline (used directly or as a feature for the ML model)
  const avgWait = remainingCurrentMin + peopleAhead * avgConsult;

  let estimatedWaitMin;
  let etaSource;
  if (_model) {
    estimatedWaitMin = _predictWaitMin(_model, {
      waitBase:           avgWait,
      peopleAhead,
      avgConsultMin:      avgConsult,
      remainingCurrentMin,
    });
    etaSource = 'MODEL';
  } else {
    estimatedWaitMin = Math.round(avgWait);
    etaSource = 'AVG';
  }

  // estimatedCallAt = max(now + wait, slotTime)  (DATABASE_SCHEMA §4.3)
  const fromNow = Date.now() + estimatedWaitMin * 60_000;
  const slotMs  = targetToken.slotTime ? new Date(targetToken.slotTime).getTime() : 0;
  const estimatedCallAt = new Date(Math.max(fromNow, slotMs));

  return { position, peopleAhead, estimatedWaitMin, estimatedCallAt, etaSource };
}

/**
 * Compute ETAs for every WAITING token of a doctor in a single pass.
 * Returns a Map<tokenId, EtaResult>.
 */
export function computeQueueEtas(doctor, waitingTokens, calledToken) {
  const map = new Map();
  for (const t of waitingTokens) {
    const eta = computeEta(doctor, waitingTokens, calledToken, t);
    if (eta) map.set(t.id, eta);
  }
  return map;
}

// ─── DB HELPER ────────────────────────────────────────────────────────────────

/**
 * Fetch doctor + today's WAITING and CALLED tokens, with the includes
 * expected by presenter.fmtToken / fmtTokenPublic.
 *
 * @param {string} doctorId
 * @param {Date}  [serviceDate]  Defaults to today in HOSPITAL_TZ.
 * @returns {{ doctor, waiting: Token[], called: Token|null }}
 */
export async function buildDoctorContext(doctorId, serviceDate) {
  const sd = serviceDate ?? getHospitalDate();

  const [doctor, waiting, called] = await Promise.all([
    prisma.doctor.findUnique({ where: { id: doctorId } }),
    prisma.token.findMany({
      where:   { doctorId, serviceDate: sd, status: TokenStatus.WAITING },
      orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: TOKEN_INCLUDE,
    }),
    prisma.token.findFirst({
      where:   { doctorId, serviceDate: sd, status: TokenStatus.CALLED },
      include: TOKEN_INCLUDE,
    }),
  ]);

  return { doctor, waiting, called };
}
