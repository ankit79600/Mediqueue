/**
 * stats.service.js — AdminStats aggregation (API_CONTRACT §2.9 / E21).
 *
 * buildAdminStats(today) is called:
 *   • On-demand: GET /admin/stats (E21)
 *   • Throttled broadcast: scheduleStatsUpdate() in emitters.js (SOCKET_CONTRACT §5)
 *
 * All counts are scoped to serviceDate = today. Times are in milliseconds
 * (converted to minutes in the return value).
 */

import prisma from '../db.js';
import config from '../config.js';

// ─── LOCAL HOUR HELPER ────────────────────────────────────────────────────────

// Returns the integer 0–23 local hour for a UTC Date in the hospital TZ.
function localHourInt(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.HOSPITAL_TZ,
    hour:     '2-digit',
    hour12:   false,
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === 'hour').value, 10);
}

function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

// ─── ROUNDING HELPER ─────────────────────────────────────────────────────────

function round1(n) {
  const v = Math.round(n * 10) / 10;
  return isFinite(v) ? v : 0;
}

// ─── WAIT TIME HELPERS ────────────────────────────────────────────────────────

// API_CONTRACT §2.9: effectiveStart = max(created_at, slot_time)
function effectiveStart(t) {
  return t.slotTime && t.slotTime > t.createdAt ? t.slotTime : t.createdAt;
}

// Mean of (calledAt − effectiveStart) in minutes, for tokens that have been called.
function avgWaitMin(toks) {
  const called = toks.filter(t => t.calledAt);
  if (!called.length) return 0;
  const sum = called.reduce((acc, t) => acc + Math.max(0, t.calledAt - effectiveStart(t)), 0);
  return round1(sum / called.length / 60_000);
}

// ─── HOURLY BUCKETS ───────────────────────────────────────────────────────────

function buildHourlyBuckets(tokens, now) {
  if (!tokens.length) return [];

  const earliestMs = Math.min(...tokens.map(t => t.createdAt.getTime()));
  const startH     = localHourInt(new Date(earliestMs));
  const endH       = localHourInt(now);

  // Accumulate per local-hour label
  const arrivals  = new Map();
  const completed = new Map();

  for (const t of tokens) {
    const h = hourLabel(localHourInt(t.createdAt));
    arrivals.set(h, (arrivals.get(h) ?? 0) + 1);

    if (t.status === 'COMPLETED' && t.endedAt) {
      const ch = hourLabel(localHourInt(t.endedAt));
      completed.set(ch, (completed.get(ch) ?? 0) + 1);
    }
  }

  const rows = [];
  for (let h = startH; h <= endH; h++) {
    const label = hourLabel(h);
    rows.push({ hour: label, arrivals: arrivals.get(label) ?? 0, completed: completed.get(label) ?? 0 });
  }
  return rows;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Compute the full AdminStats object for the given hospital service date.
 *
 * @param {Date} today  Midnight-UTC Date representing the hospital's local date
 *                      (from getHospitalDate()).
 * @returns {object}    AdminStats shape per API_CONTRACT §2.9
 */
export async function buildAdminStats(today) {
  const now = new Date();

  // Parallel fetch — tokens today, active doctors, all departments
  const [tokens, activeDoctors, departments] = await Promise.all([
    prisma.token.findMany({
      where:  { serviceDate: today },
      select: {
        status:       true,
        departmentId: true,
        createdAt:    true,
        calledAt:     true,
        endedAt:      true,
        slotTime:     true,
      },
    }),
    prisma.doctor.findMany({
      where:  { isActive: true },
      select: { id: true, departmentId: true, avgConsultMin: true },
    }),
    prisma.department.findMany({ orderBy: { displayOrder: 'asc' } }),
  ]);

  // Index by departmentId for O(1) lookups
  const doctorsByDept = new Map();
  for (const d of activeDoctors) {
    if (!doctorsByDept.has(d.departmentId)) doctorsByDept.set(d.departmentId, []);
    doctorsByDept.get(d.departmentId).push(d);
  }

  const tokensByDept = new Map();
  for (const t of tokens) {
    if (!tokensByDept.has(t.departmentId)) tokensByDept.set(t.departmentId, []);
    tokensByDept.get(t.departmentId).push(t);
  }

  // ── Per-department stats ───────────────────────────────────────────────────
  const deptStats = departments.map(dept => {
    const dt = tokensByDept.get(dept.id) ?? [];
    const dd = doctorsByDept.get(dept.id) ?? [];

    const queueLength    = dt.filter(t => t.status === 'WAITING').length;
    const inConsultation = dt.filter(t => t.status === 'CALLED').length;
    const completedToday = dt.filter(t => t.status === 'COMPLETED').length;
    const noShowToday    = dt.filter(t => t.status === 'NO_SHOW').length;
    const activeDoctorCnt = dd.length;

    const deptAvgConsultMin = dd.length
      ? round1(dd.reduce((s, d) => s + Number(d.avgConsultMin), 0) / dd.length)
      : 0;

    const waitingTokens   = dt.filter(t => t.status === 'WAITING');
    const longestWaitMin  = waitingTokens.length
      ? round1(Math.max(...waitingTokens.map(t => (now - effectiveStart(t)) / 60_000)))
      : 0;

    return {
      departmentId:   dept.id,
      name:           dept.name,
      code:           dept.code,
      queueLength,
      inConsultation,
      completedToday,
      noShowToday,
      avgWaitMin:     avgWaitMin(dt),
      avgConsultMin:  deptAvgConsultMin,
      activeDoctors:  activeDoctorCnt,
      loadPerDoctor:  round1(queueLength / Math.max(activeDoctorCnt, 1)),
      longestWaitMin,
    };
  });

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = {
    waiting:        tokens.filter(t => t.status === 'WAITING').length,
    inConsultation: tokens.filter(t => t.status === 'CALLED').length,
    completedToday: tokens.filter(t => t.status === 'COMPLETED').length,
    noShowToday:    tokens.filter(t => t.status === 'NO_SHOW').length,
    cancelledToday: tokens.filter(t => t.status === 'CANCELLED').length,
    avgWaitMin:     avgWaitMin(tokens),
    activeDoctors:  activeDoctors.length,
  };

  return {
    serviceDate: today.toISOString().slice(0, 10),
    totals,
    departments: deptStats,
    hourly:      buildHourlyBuckets(tokens, now),
    generatedAt: now.toISOString(),
  };
}
