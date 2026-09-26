import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { validate } from '../middleware/validate.js';
import { requirePatient, optionalAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode, TokenStatus } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import { createToken, cancelToken } from '../services/queue.service.js';
import { fmtToken } from '../presenter.js';
import { getIo } from '../realtime/io.js';
import { flush } from '../realtime/emitters.js';

const router = Router();

// ─── E9  POST /tokens ──────────────────────────────────────────────────────────

const tokenCreateBody = z.object({
  departmentId: z.string().uuid(),
  doctorId:     z.string().uuid().nullable().default(null),
  type:         z.enum(['LIVE', 'SLOT']),
  slotId:       z.string().uuid().nullable().default(null),
  priority:     z.enum(['NONE', 'ELDERLY', 'PREGNANT']).default('NONE'),
});

router.post('/tokens', requirePatient, validate({ body: tokenCreateBody }), async (req, res, next) => {
  try {
    const { token: raw, changes } = await createToken(req.user.sub, {
      ...req.body,
      actorType: 'PATIENT',
      actorId:   req.user.sub,
    });
    const today = getHospitalDate();
    const [tokenWI, ctx] = await Promise.all([
      prisma.token.findUnique({ where: { id: raw.id }, include: TOKEN_INCLUDE }),
      buildDoctorContext(raw.doctorId, today),
    ]);
    const etaMap = computeQueueEtas(ctx.doctor, ctx.waiting, ctx.called);

    res.status(201).json(fmtToken(tokenWI, etaMap.get(raw.id) ?? null));
    flush(getIo(), changes).catch(err => console.error('[flush] E9:', err.message));
  } catch (err) {
    next(err);
  }
});

// ─── E10  GET /tokens/me ───────────────────────────────────────────────────────
// Registered before /:tokenId so Express doesn't treat "me" as a param.

router.get('/tokens/me', requirePatient, async (req, res, next) => {
  try {
    const today     = getHospitalDate();
    const patientId = req.user.sub;

    const [active, history] = await Promise.all([
      prisma.token.findMany({
        where:   { patientId, serviceDate: today, status: { in: [TokenStatus.WAITING, TokenStatus.CALLED] } },
        orderBy: { createdAt: 'asc' },
        include: TOKEN_INCLUDE,
      }),
      prisma.token.findMany({
        where:   { patientId, serviceDate: today, status: { notIn: [TokenStatus.WAITING, TokenStatus.CALLED] } },
        orderBy: { createdAt: 'desc' },
        include: TOKEN_INCLUDE,
      }),
    ]);

    // Build ETAs per unique doctor (avoids redundant DB round-trips)
    const doctorIds = [...new Set(active.map(t => t.doctorId))];
    const ctxEntries = await Promise.all(
      doctorIds.map(async id => [id, await buildDoctorContext(id, today)])
    );
    const etaMaps = new Map(
      ctxEntries.map(([id, ctx]) => [
        id,
        computeQueueEtas(ctx.doctor, ctx.waiting, ctx.called),
      ])
    );

    res.json({
      active:  active.map(t => fmtToken(t, etaMaps.get(t.doctorId)?.get(t.id) ?? null)),
      history: history.map(t => fmtToken(t, null)),
    });
  } catch (err) {
    next(err);
  }
});

// ─── E11  GET /tokens/:tokenId ────────────────────────────────────────────────

router.get('/tokens/:tokenId', optionalAuth, async (req, res, next) => {
  try {
    if (!req.user) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Authentication required'));

    const token = await prisma.token.findUnique({
      where:   { id: req.params.tokenId },
      include: TOKEN_INCLUDE,
    });
    if (!token) return next(new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found'));

    // Patients can only view their own tokens; staff/admin see any
    if (req.user.role === 'PATIENT' && token.patientId !== req.user.sub) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'You can only view your own tokens'));
    }

    const { doctor, waiting, called } = await buildDoctorContext(token.doctorId, token.serviceDate);
    const etaMap = computeQueueEtas(doctor, waiting, called);

    res.json(fmtToken(token, etaMap.get(token.id) ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── E12  DELETE /tokens/:tokenId ─────────────────────────────────────────────

router.delete('/tokens/:tokenId', requirePatient, async (req, res, next) => {
  try {
    const { token: raw, changes } = await cancelToken(req.params.tokenId, req.user.sub);

    const tokenWI = await prisma.token.findUnique({ where: { id: raw.id }, include: TOKEN_INCLUDE });
    res.json(fmtToken(tokenWI, null));
    flush(getIo(), changes).catch(err => console.error('[flush] E12:', err.message));
  } catch (err) {
    next(err);
  }
});

export default router;
