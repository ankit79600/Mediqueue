import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import config from '../config.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode } from '@mediqueue/shared';
import { maskPhone } from '../utils.js';

const PHONE_RE = /^[6-9]\d{9}$/;
const OTP_TTL_SEC = 300; // 5 min
const OTP_MAX_ATTEMPTS = 5;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function hashOtp(code) {
  // DATABASE_SCHEMA §3.5: sha256(code + OTP_PEPPER) hex
  return crypto.createHash('sha256').update(code + config.OTP_PEPPER).digest('hex');
}

function mintJwt(payload, ttl) {
  const accessToken = jwt.sign(payload, config.JWT_SECRET, { expiresIn: ttl });
  const { iat, exp } = jwt.decode(accessToken);
  return { accessToken, expiresIn: exp - iat };
}

// ─── PRESENTER ────────────────────────────────────────────────────────────────

export function formatPatient(p) {
  return {
    id: p.id,
    phone: p.phone ?? null,
    phoneMasked: maskPhone(p.phone),
    name: p.name ?? null,
    age: p.age ?? null,
    gender: p.gender ?? null,
    consentAt: p.consentAt?.toISOString() ?? null,
    profileComplete: !!(p.name && p.age != null && p.consentAt),
  };
}

// ─── E2  POST /auth/otp/request ───────────────────────────────────────────────

export async function requestOtp(phone) {
  if (!PHONE_RE.test(phone)) {
    throw new AppError(400, ErrorCode.INVALID_PHONE, 'Phone must be a 10-digit Indian mobile number starting with 6-9');
  }

  const code = String(Math.floor(100_000 + Math.random() * 900_000));
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);

  await prisma.otpRequest.create({ data: { phone, codeHash, expiresAt } });

  const res = { phone, expiresInSec: OTP_TTL_SEC, resendAfterSec: 30 };
  if (config.DEMO_MODE) res.devOtp = code; // API_CONTRACT E2: only when DEMO_MODE=true
  return res;
}

// ─── E3  POST /auth/otp/verify ────────────────────────────────────────────────

export async function verifyOtp(phone, code) {
  const otp = await prisma.otpRequest.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError(410, ErrorCode.OTP_EXPIRED, 'No active OTP for this phone number');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(429, ErrorCode.OTP_TOO_MANY_ATTEMPTS, 'Too many attempts — request a new OTP');
  }

  if (hashOtp(code) !== otp.codeHash) {
    await prisma.otpRequest.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, ErrorCode.OTP_INVALID, 'Incorrect OTP code', {
      attemptsLeft: OTP_MAX_ATTEMPTS - (otp.attempts + 1),
    });
  }

  // Mark consumed — single use
  await prisma.otpRequest.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  // Upsert patient (create on first login)
  let isNewPatient = false;
  let patient = await prisma.patient.findUnique({ where: { phone } });
  if (!patient) {
    isNewPatient = true;
    patient = await prisma.patient.create({ data: { phone } });
  }

  const { accessToken, expiresIn } = mintJwt(
    { sub: patient.id, role: 'PATIENT' },
    config.JWT_TTL_PATIENT,
  );
  return { accessToken, expiresIn, isNewPatient, patient: formatPatient(patient) };
}

// ─── E4  POST /auth/staff/login ───────────────────────────────────────────────

export async function staffLogin(username, password) {
  const staff = await prisma.staff.findUnique({
    where: { username },
    include: { doctor: { select: { departmentId: true } } },
  });

  if (!staff || !(await bcrypt.compare(password, staff.passwordHash))) {
    throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password');
  }

  const deptId = staff.doctor?.departmentId ?? null;
  const { accessToken, expiresIn } = mintJwt(
    { sub: staff.id, role: staff.role, doctorId: staff.doctorId ?? null, deptId },
    config.JWT_TTL_STAFF,
  );

  return {
    accessToken,
    expiresIn,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
      doctorId: staff.doctorId ?? null,
      departmentId: deptId,
    },
  };
}

// ─── E5  GET /patients/me ─────────────────────────────────────────────────────

export async function getPatient(patientId) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Patient not found');
  return formatPatient(patient);
}

// ─── E6  PUT /patients/me ─────────────────────────────────────────────────────

export async function updatePatient(patientId, { name, age, gender, consent }) {
  if (!consent) {
    throw new AppError(400, ErrorCode.CONSENT_REQUIRED, 'You must provide consent to update your profile');
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!existing) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Patient not found');

  const updated = await prisma.patient.update({
    where: { id: patientId },
    data: {
      name,
      age,
      ...(gender !== undefined && { gender }),
      consentAt: existing.consentAt ?? new Date(), // set once, never overwrite
    },
  });

  return formatPatient(updated);
}
