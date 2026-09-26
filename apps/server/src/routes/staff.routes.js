import { Router } from 'express';
import prisma from '../db.js';
import { requireStaff, requireDoctorAccess } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import { callNext, skipToken, noShow, completeToken } from '../services/queue.service.js';
import { fmtToken, fmtDoctor, fmtQueueSnapshot } from '../presenter.js';
import { getIo } from '../realtime/io.js';
import { flush } from '../realtime/emitters.js';

const router = Router();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * X-Actor: SIMULATOR header is honoured only for ADMIN JWTs (API_CONTRACT §1).
 * Otherwise the actor type equals the user's role.
 */
function resolveActorType(req) {
  if (req.headers['x-actor'] === 'SIMULATOR' && req.user?.role === 'ADMIN') {
    return 'SIMULATOR';
  }
  return req.user?.role ?? 'STAFF';
}

/**
 * Fetch everything needed to build a QueueSnapshot for a doctor.
 */
async function buildSnapshotContext(doctorId, today) {
  const [ctx, servedToday, noShowToday] = await Promise.all([
    buildDoctorContext(doctorId, today),
    prisma.token.count({ where: { doctorId, serviceDate: today, status: 'COMPLETED' } }),
    prisma.token.count({ where: { doctorId, serviceDate: today, status: 'NO_SHOW' } }),
  ]);
  const { doctor, waiting, called } = ctx;
  const etaMap = computeQueueEtas(doctor, waiting, called);
  const dept   = await prisma.department.findUnique({ where: { id: doctor.departmentId } });
  return { doctor, waiting, called, etaMap, servedToday, noShowToday, dept };
}

function makeSnapshot(ctx) {
  const { doctor, waiting, called, etaMap, servedToday, noShowToday, dept } = ctx;
  const docShape  = fmtDoctor(doctor, { queueLength: waiting.length, currentTokenNo: called?.tokenNo ?? null });
  const deptBrief = { id: dept.id, name: dept.name, code: dept.code };
  const current   = called  ? fmtToken(called, null)                      : null;
  const waitingFmt = waiting.map(t => fmtToken(t, etaMap.get(t.id) ?? null));
  return fmtQueueSnapshot(docShape, deptBrief, current, waitingFmt, { servedToday, noShowToday });
}

// ─── E16  GET /staff/doctors/:doctorId/queue ──────────────────────────────────

router.get(
  '/doctors/:doctorId/queue',
  requireStaff,
  requireDoctorAccess('doctorId'),
  async (req, res, next) => {
    try {
      const { doctorId } = req.params;
      const today        = getHospitalDate();
      const ctx          = await buildSnapshotContext(doctorId, today);

      if (!ctx.doctor) return next(new AppError(404, ErrorCode.DOCTOR_NOT_FOUND, 'Doctor not found'));

      res.json(makeSnapshot(ctx));
    } catch (err) {
      next(err);
    }
  }
);

// ─── E17  POST /staff/doctors/:doctorId/call-next ─────────────────────────────

router.post(
  '/doctors/:doctorId/call-next',
  requireStaff,
  requireDoctorAccess('doctorId'),
  async (req, res, next) => {
    try {
      const { doctorId }  = req.params;
      const actorType     = resolveActorType(req);
      const actorId       = req.user.sub;
      const today         = getHospitalDate();

      const { token: raw, changes } = await callNext(doctorId, actorType, actorId);

      const [tokenWI, ctx] = await Promise.all([
        prisma.token.findUnique({ where: { id: raw.id }, include: TOKEN_INCLUDE }),
        buildSnapshotContext(doctorId, today),
      ]);

      flush(getIo(), changes).catch(err => console.error('[flush] E17:', err.message));
      res.json({
        token: fmtToken(tokenWI, null), // CALLED token — position = 0
        queue: makeSnapshot(ctx),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── E18  POST /staff/tokens/:tokenId/skip ────────────────────────────────────

router.post('/tokens/:tokenId/skip', requireStaff, async (req, res, next) => {
  try {
    const { tokenId }    = req.params;
    const actorType      = resolveActorType(req);
    const actorId        = req.user.sub;
    const callerDoctorId = req.user.role === 'ADMIN' ? null : req.user.doctorId;
    const today          = getHospitalDate();

    const { token: raw, result, changes } = await skipToken(tokenId, actorType, actorId, callerDoctorId);

    const [tokenWI, ctx] = await Promise.all([
      prisma.token.findUnique({ where: { id: tokenId }, include: TOKEN_INCLUDE }),
      buildSnapshotContext(raw.doctorId, today),
    ]);
    // REQUEUED → token is WAITING → get ETA from fresh snapshot; NO_SHOW → null
    const tokenEta = raw.status === 'WAITING' ? (ctx.etaMap.get(tokenId) ?? null) : null;

    flush(getIo(), changes).catch(err => console.error('[flush] E18:', err.message));
    res.json({
      token:  fmtToken(tokenWI, tokenEta),
      queue:  makeSnapshot(ctx),
      result,
    });
  } catch (err) {
    next(err);
  }
});

// ─── E19  POST /staff/tokens/:tokenId/no-show ────────────────────────────────

router.post('/tokens/:tokenId/no-show', requireStaff, async (req, res, next) => {
  try {
    const { tokenId }    = req.params;
    const actorType      = resolveActorType(req);
    const actorId        = req.user.sub;
    const callerDoctorId = req.user.role === 'ADMIN' ? null : req.user.doctorId;
    const today          = getHospitalDate();

    const { token: raw, changes } = await noShow(tokenId, actorType, actorId, callerDoctorId);

    const [tokenWI, ctx] = await Promise.all([
      prisma.token.findUnique({ where: { id: tokenId }, include: TOKEN_INCLUDE }),
      buildSnapshotContext(raw.doctorId, today),
    ]);

    flush(getIo(), changes).catch(err => console.error('[flush] E19:', err.message));
    res.json({
      token: fmtToken(tokenWI, null),
      queue: makeSnapshot(ctx),
    });
  } catch (err) {
    next(err);
  }
});

// ─── E20  POST /staff/tokens/:tokenId/complete ───────────────────────────────

router.post('/tokens/:tokenId/complete', requireStaff, async (req, res, next) => {
  try {
    const { tokenId }    = req.params;
    const actorType      = resolveActorType(req);
    const actorId        = req.user.sub;
    const callerDoctorId = req.user.role === 'ADMIN' ? null : req.user.doctorId;
    const today          = getHospitalDate();

    const { token: raw, changes } = await completeToken(tokenId, actorType, actorId, callerDoctorId);

    const [tokenWI, ctx] = await Promise.all([
      prisma.token.findUnique({ where: { id: tokenId }, include: TOKEN_INCLUDE }),
      buildSnapshotContext(raw.doctorId, today),
    ]);

    flush(getIo(), changes).catch(err => console.error('[flush] E20:', err.message));
    res.json({
      token: fmtToken(tokenWI, null),
      queue: makeSnapshot(ctx),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
