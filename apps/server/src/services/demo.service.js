/**
 * demo.service.js — demo reset logic (E25, SOCKET_CONTRACT T9).
 *
 * resetDemo():
 *   1. Stops the simulator (if running).
 *   2. Deletes today's tokens (queue_events + notifications cascade), counters.
 *   3. Re-seeds 40 WAITING tokens using the same distribution as prisma/seed.js §6.
 *   4. Emits simulator:status → demo:reset (T9 order).
 *
 * Token data constants must stay in sync with prisma/seed.js §6.
 */

import prisma from '../db.js';
import { SOCKET_EVENTS, rooms } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { getStatus, stopSimulator } from './simulator.service.js';

// ─── SEED CONSTANTS (mirror prisma/seed.js §6) ────────────────────────────────

const PATIENT_AGES = [
  28, 45, 35, 62, 29,   67, 71, 38, 25, 55,
  31, 64, 42, 26, 73,   22, 48, 33, 70, 36,
  27, 65, 41, 29, 39,   52, 24, 30, 68, 44,
  37, 26, 31, 29, 27,   28, 54, 43, 34, 46,
];

// Patient index (0-based) → doctor name; matches patientDoctorAssign in seed.js.
const PATIENT_DOCTOR_NAMES = [
  ...Array(5).fill('Dr. A. Sen'),
  ...Array(5).fill('Dr. R. Patel'),
  ...Array(5).fill('Dr. S. Mehta'),
  ...Array(5).fill('Dr. P. Sharma'),
  ...Array(10).fill('Dr. V. Kumar'),
  ...Array(10).fill('Dr. M. Gupta'),
];

// 0-based index → priority override (EMERGENCY / PREGNANT)
const PRIORITY_OVERRIDES = {
  5: 'EMERGENCY', 10: 'EMERGENCY', 20: 'EMERGENCY', 30: 'EMERGENCY',
  32: 'PREGNANT',  33: 'PREGNANT',  34: 'PREGNANT',
};

// DATABASE_SCHEMA §4.2 sort_key formula
function calcSortKey(createdAt, priority) {
  const b = BigInt(createdAt.getTime());
  if (priority === 'EMERGENCY')                             return b - BigInt(86_400_000);
  if (priority === 'ELDERLY' || priority === 'PREGNANT')   return b - BigInt(900_000);
  return b;
}

// ─── DEMO RESET ───────────────────────────────────────────────────────────────

export async function resetDemo(io) {
  // 1. Stop simulator so its timers don't race with the delete/reseed
  if (getStatus().running) stopSimulator();

  const today = getHospitalDate();

  // 2. Delete today's transient data.
  //    queue_events and notifications are ON DELETE CASCADE from tokens.
  await prisma.token.deleteMany({ where: { serviceDate: today } });
  await prisma.deptDailyCounter.deleteMany({ where: { serviceDate: today } });

  // 3. Re-seed 40 WAITING tokens
  const tokensSeeded = await _seedTokens(today);

  // 4. T9 emission order: simulator:status → demo:reset
  io.to(rooms.admin()).emit(SOCKET_EVENTS.SIMULATOR_STATUS, getStatus());
  io.emit(SOCKET_EVENTS.DEMO_RESET, { at: new Date().toISOString() });

  return { ok: true, tokensSeeded };
}

// ─── TOKEN SEEDING (direct Prisma — no service layer, no events) ──────────────

async function _seedTokens(today) {
  // Phones are 9000000001-9000000040; ascending phone order = patient index 0-39.
  const phoneList = Array.from({ length: 40 }, (_, i) =>
    `90000000${String(i + 1).padStart(2, '0')}`,
  );

  const [patients, allDoctors, departments] = await Promise.all([
    prisma.patient.findMany({
      where:   { phone: { in: phoneList } },
      orderBy: { phone: 'asc' },
    }),
    prisma.doctor.findMany({ where: { isActive: true }, include: { department: true } }),
    prisma.department.findMany(),
  ]);

  const doctorByName = new Map(allDoctors.map(d => [d.name, d]));
  const deptById     = new Map(departments.map(d => [d.id, d]));

  // Stagger createdAt 2 min apart, oldest 80 min ago — same as seed.js
  const baseMs = Date.now() - 40 * 2 * 60_000;

  const seqCounters = new Map();
  let seeded = 0;

  for (let i = 0; i < patients.length; i++) {
    const patient    = patients[i];
    const doctorName = PATIENT_DOCTOR_NAMES[i];
    const doctor     = doctorByName.get(doctorName);
    if (!doctor) continue;

    const dept = deptById.get(doctor.departmentId);
    if (!dept) continue;

    // Determine priority
    let priority = PRIORITY_OVERRIDES[i] ?? 'NONE';
    if (priority === 'NONE' && PATIENT_AGES[i] >= 60) priority = 'ELDERLY';

    const prevSeq  = seqCounters.get(dept.id) ?? 0;
    const tokenSeq = prevSeq + 1;
    seqCounters.set(dept.id, tokenSeq);

    const tokenNo   = `${dept.code}-${String(tokenSeq).padStart(3, '0')}`;
    const createdAt = new Date(baseMs + i * 2 * 60_000);
    const sortKey   = calcSortKey(createdAt, priority);

    await prisma.token.create({
      data: {
        patientId:    patient.id,
        departmentId: dept.id,
        doctorId:     doctor.id,
        serviceDate:  today,
        tokenSeq,
        tokenNo,
        type:         'LIVE',
        priority,
        status:       'WAITING',
        sortKey,
        createdAt,
      },
    });
    seeded++;
  }

  // Upsert dept_daily_counters with final seq per dept
  for (const [departmentId, lastSeq] of seqCounters.entries()) {
    await prisma.deptDailyCounter.upsert({
      where:  { departmentId_serviceDate: { departmentId, serviceDate: today } },
      update: { lastSeq },
      create: { departmentId, serviceDate: today, lastSeq },
    });
  }

  return seeded;
}
