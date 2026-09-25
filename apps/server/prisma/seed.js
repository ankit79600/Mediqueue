// DATABASE_SCHEMA §7 — seed data for local development and hackathon demo.
// Idempotent: departments/doctors/staff/slots use upsert; tokens skip if already seeded today.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for today (or +daysOffset) in Asia/Kolkata */
function localDateStr(daysOffset = 0) {
  const d = new Date(Date.now() + daysOffset * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Parses a YYYY-MM-DD string to a Date at midnight UTC (Prisma @db.Date) */
function parseDate(str) {
  return new Date(str + 'T00:00:00.000Z');
}

/** UTC DateTime for a time that is HH:MM in Asia/Kolkata on a given YYYY-MM-DD date */
function istToUtc(dateStr, istHour, istMin) {
  // Asia/Kolkata = UTC+5:30, so subtract 5h 30m
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMinutes = istHour * 60 + istMin - (5 * 60 + 30);
  const utcHour = Math.floor(utcMinutes / 60);
  const utcMin = ((utcMinutes % 60) + 60) % 60;
  const dayOffset = utcMinutes < 0 ? -1 : 0;
  return new Date(Date.UTC(y, m - 1, d + dayOffset, utcHour, utcMin, 0, 0));
}

// ─── STATIC DATA ──────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { name: 'General Medicine', code: 'GM', displayOrder: 0 },
  { name: 'Paediatrics',      code: 'PED', displayOrder: 1 },
  { name: 'Orthopaedics',     code: 'ORT', displayOrder: 2 },
  { name: 'Gynaecology',      code: 'GYN', displayOrder: 3 },
];

// deptCode → array of { name, room, staffUsername }
const DOCTORS = {
  GM:  [
    { name: 'Dr. A. Sen',    room: 'OPD-01', staffUsername: 'dr.sen'    },
    { name: 'Dr. R. Patel',  room: 'OPD-02', staffUsername: 'dr.patel'  },
  ],
  PED: [
    { name: 'Dr. S. Mehta',  room: 'OPD-03', staffUsername: 'dr.mehta'  },
    { name: 'Dr. P. Sharma', room: 'OPD-04', staffUsername: 'dr.sharma' },
  ],
  ORT: [
    { name: 'Dr. V. Kumar',  room: 'OPD-05', staffUsername: 'dr.kumar'  },
  ],
  GYN: [
    { name: 'Dr. M. Gupta',  room: 'OPD-06', staffUsername: 'dr.gupta'  },
  ],
};

// 40 synthetic patients — DATABASE_SCHEMA §7
const PATIENT_NAMES = [
  'Aarav Sharma',     'Vihaan Patel',    'Aditya Verma',    'Vivaan Singh',    'Ananya Gupta',
  'Diya Joshi',       'Arjun Kumar',     'Sai Reddy',       'Reyansh Nair',    'Krishna Iyer',
  'Ishaan Rao',       'Meera Pillai',    'Dhruv Mehta',     'Kavya Shah',      'Arnav Choudhary',
  'Nisha Bose',       'Advik Mishra',    'Riya Chatterjee', 'Shaurya Das',     'Priya Mukherjee',
  'Atharv Pandey',    'Sneha Banerjee',  'Rudra Kaur',      'Pooja Malhotra',  'Yash Jain',
  'Tanvi Saxena',     'Om Agarwal',      'Shreya Kapoor',   'Kabir Desai',     'Divya Nambiar',
  'Aryan Bhatt',      'Simran Tiwari',   'Harsh Dubey',     'Priyanka Sinha',  'Rohan Misra',
  'Ankita Roy',       'Vikram Patil',    'Sunita Yadav',    'Nikhil Ghosh',    'Bharti Shukla',
];

// Ages: mix of young, middle-aged, elderly (≥60 → auto ELDERLY)
const PATIENT_AGES = [
  28, 45, 35, 62, 29,   // 1-5:  index 3 (age 62) → ELDERLY
  67, 71, 38, 25, 55,   // 6-10: index 0,1 → ELDERLY
  31, 64, 42, 26, 73,   // 11-15: index 1,4 → ELDERLY
  22, 48, 33, 70, 36,   // 16-20: index 3 → ELDERLY
  27, 65, 41, 29, 39,   // 21-25: index 1 → ELDERLY
  52, 24, 30, 68, 44,   // 26-30: index 3 → ELDERLY
  37, 26, 31, 29, 27,   // 31-35
  28, 54, 43, 34, 46,   // 36-40
];

const PATIENT_GENDERS = [
  'MALE','MALE','MALE','MALE','FEMALE',
  'MALE','MALE','FEMALE','MALE','MALE',
  'MALE','FEMALE','MALE','FEMALE','MALE',
  'FEMALE','MALE','FEMALE','MALE','FEMALE',
  'MALE','FEMALE','MALE','FEMALE','MALE',
  'FEMALE','MALE','FEMALE','MALE','FEMALE',
  'MALE','FEMALE','MALE','FEMALE','MALE',
  'FEMALE','MALE','FEMALE','MALE','FEMALE',
];

// Priority overrides (0-based index into 40-patient list):
// ≈4 EMERGENCY, 6 ELDERLY auto from age, 3 PREGNANT
// Emergency: patients 5,10,20,30 (0-based)
// Pregnant:  patients 32,33,34 (0-based) → females in GYN range
const PRIORITY_OVERRIDES = {
  5:  'EMERGENCY',
  10: 'EMERGENCY',
  20: 'EMERGENCY',
  30: 'EMERGENCY',
  32: 'PREGNANT',
  33: 'PREGNANT',
  34: 'PREGNANT',
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Departments
  const deptMap = {}; // code → { id, code }
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name, displayOrder: dept.displayOrder },
      create: { name: dept.name, code: dept.code, displayOrder: dept.displayOrder },
    });
    deptMap[dept.code] = row;
  }
  console.log(`  ✔ departments: ${Object.keys(deptMap).join(', ')}`);

  // 2. Doctors
  const doctorMap = {}; // staffUsername → doctor row
  for (const [code, doctors] of Object.entries(DOCTORS)) {
    const dept = deptMap[code];
    for (const d of doctors) {
      const row = await prisma.doctor.upsert({
        where: { id: (await prisma.doctor.findFirst({ where: { name: d.name, departmentId: dept.id } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
        update: { room: d.room, isActive: true },
        create: { departmentId: dept.id, name: d.name, room: d.room },
      });
      doctorMap[d.staffUsername] = row;
    }
  }
  console.log(`  ✔ doctors: ${Object.keys(doctorMap).join(', ')}`);

  // 3. Staff (1 per doctor + 1 admin)
  const staffPassword = await bcrypt.hash('demo123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  for (const [username, doctor] of Object.entries(doctorMap)) {
    await prisma.staff.upsert({
      where: { username },
      update: { passwordHash: staffPassword, doctorId: doctor.id },
      create: {
        username,
        passwordHash: staffPassword,
        name: doctor.name,
        role: 'STAFF',
        doctorId: doctor.id,
      },
    });
  }
  await prisma.staff.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPassword },
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
      doctorId: null,
    },
  });
  console.log('  ✔ staff: dr.sen, dr.patel, dr.mehta, dr.sharma, dr.kumar, dr.gupta, admin');

  // 4. Slots — today + tomorrow, 09:00–13:00 IST (16 × 15-min slots per doctor per day)
  const allDoctors = Object.values(doctorMap);
  for (const daysOffset of [0, 1]) {
    const dateStr = localDateStr(daysOffset);
    const serviceDate = parseDate(dateStr);

    for (const doctor of allDoctors) {
      for (let i = 0; i < 16; i++) {
        const istHour = 9 + Math.floor(i * 15 / 60);
        const istMin  = (i * 15) % 60;
        const startTime = istToUtc(dateStr, istHour, istMin);
        const endTime   = new Date(startTime.getTime() + 15 * 60 * 1000);

        await prisma.slot.upsert({
          where: { doctorId_startTime: { doctorId: doctor.id, startTime } },
          update: {},
          create: { doctorId: doctor.id, serviceDate, startTime, endTime, capacity: 3, bookedCount: 0 },
        });
      }
    }
  }
  console.log(`  ✔ slots: 16 slots × 6 doctors × 2 days = 192 slots`);

  // 5. Patients — 40 synthetic
  const todayStr = localDateStr(0);
  const existingTokenCount = await prisma.token.count({
    where: { serviceDate: parseDate(todayStr) },
  });
  if (existingTokenCount >= 40) {
    console.log(`  ⏭ tokens already seeded for ${todayStr} (${existingTokenCount} found), skipping.`);
    return;
  }

  const patientRows = [];
  for (let i = 0; i < 40; i++) {
    const phone = `90000000${String(i + 1).padStart(2, '0')}`;
    const row = await prisma.patient.upsert({
      where: { phone },
      update: {
        name: PATIENT_NAMES[i],
        age: PATIENT_AGES[i],
        gender: PATIENT_GENDERS[i],
        consentAt: new Date(),
      },
      create: {
        phone,
        name: PATIENT_NAMES[i],
        age: PATIENT_AGES[i],
        gender: PATIENT_GENDERS[i],
        consentAt: new Date(),
        isWalkIn: false,
      },
    });
    patientRows.push(row);
  }
  console.log(`  ✔ patients: 40 synthetic (phones 9000000001–9000000040)`);

  // 6. Tokens — 40 WAITING, distributed across doctors
  // Distribution: GM(Sen 5, Patel 5) PED(Mehta 5, Sharma 5) ORT(Kumar 10) GYN(Gupta 10)
  const allDoctorsList = [
    doctorMap['dr.sen'],
    doctorMap['dr.patel'],
    doctorMap['dr.mehta'],
    doctorMap['dr.sharma'],
    doctorMap['dr.kumar'],
    doctorMap['dr.kumar'],  // ORT gets 10 → repeat
    doctorMap['dr.gupta'],
    doctorMap['dr.gupta'],  // GYN gets 10 → repeat
  ];

  // Interleave so doctors get patients evenly:
  // patients 0-4 → dr.sen, 5-9 → dr.patel, 10-14 → dr.mehta,
  // 15-19 → dr.sharma, 20-29 → dr.kumar, 30-39 → dr.gupta
  const patientDoctorAssign = [
    ...Array(5).fill('dr.sen'),
    ...Array(5).fill('dr.patel'),
    ...Array(5).fill('dr.mehta'),
    ...Array(5).fill('dr.sharma'),
    ...Array(10).fill('dr.kumar'),
    ...Array(10).fill('dr.gupta'),
  ];

  const today = parseDate(todayStr);
  // Stagger created_at 2 min apart, oldest first (80 min ago → 2 min ago)
  const baseMs = Date.now() - 40 * 2 * 60 * 1000;

  // Local seq counters per dept
  const seqCounters = { GM: 0, PED: 0, ORT: 0, GYN: 0 };

  for (let i = 0; i < 40; i++) {
    const patient = patientRows[i];
    const username = patientDoctorAssign[i];
    const doctor   = doctorMap[username];

    // Find which dept this doctor belongs to
    const deptCode = Object.entries(DOCTORS).find(([, docs]) =>
      docs.some(d => d.staffUsername === username)
    )[0];
    const dept = deptMap[deptCode];

    // Determine priority
    let priority = PRIORITY_OVERRIDES[i] ?? 'NONE';
    if (priority === 'NONE' && PATIENT_AGES[i] >= 60) priority = 'ELDERLY';

    // Sequence number and token number
    seqCounters[deptCode]++;
    const tokenSeq = seqCounters[deptCode];
    const tokenNo  = `${deptCode}-${String(tokenSeq).padStart(3, '0')}`;

    // sort_key (epoch ms) — DATABASE_SCHEMA §4.2
    const createdAt = new Date(baseMs + i * 2 * 60 * 1000);
    let sortKey = BigInt(createdAt.getTime());
    if (priority === 'EMERGENCY') sortKey -= BigInt(86_400_000);
    else if (priority === 'ELDERLY' || priority === 'PREGNANT') sortKey -= BigInt(900_000);

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
  }

  // 7. Dept daily counters — upsert with final seq per dept
  for (const [code, lastSeq] of Object.entries(seqCounters)) {
    if (lastSeq === 0) continue;
    const dept = deptMap[code];
    await prisma.deptDailyCounter.upsert({
      where: { departmentId_serviceDate: { departmentId: dept.id, serviceDate: today } },
      update: { lastSeq },
      create: { departmentId: dept.id, serviceDate: today, lastSeq },
    });
  }

  console.log(`  ✔ tokens: 40 WAITING for ${todayStr}`);
  console.log('     Priority breakdown:');
  const breakdown = {};
  for (let i = 0; i < 40; i++) {
    let p = PRIORITY_OVERRIDES[i] ?? 'NONE';
    if (p === 'NONE' && PATIENT_AGES[i] >= 60) p = 'ELDERLY';
    breakdown[p] = (breakdown[p] ?? 0) + 1;
  }
  for (const [p, n] of Object.entries(breakdown)) {
    console.log(`       ${p}: ${n}`);
  }

  console.log('\n✅ Seed complete.');
  console.log('\nStaff logins:');
  for (const u of ['dr.sen','dr.patel','dr.mehta','dr.sharma','dr.kumar','dr.gupta']) {
    console.log(`  ${u} / demo123`);
  }
  console.log('  admin / admin123');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
