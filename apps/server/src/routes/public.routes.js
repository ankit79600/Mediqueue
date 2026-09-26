import { Router } from 'express';
import prisma from '../db.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import { verifyTokenSig, fmtTokenPublic } from '../presenter.js';
import { buildDisplaySnapshotForDept } from '../realtime/emitters.js';

const router = Router();

// ─── E13  GET /public/tokens/:tokenId?s=<sig> ────────────────────────────────

router.get('/tokens/:tokenId', async (req, res, next) => {
  try {
    const { tokenId }  = req.params;
    const { s: sig }   = req.query;

    // Signature check before DB access — prevents leaking token existence
    if (!verifyTokenSig(tokenId, sig)) {
      return next(new AppError(403, ErrorCode.INVALID_SIGNATURE, 'Invalid or missing token signature'));
    }

    const token = await prisma.token.findUnique({
      where:   { id: tokenId },
      include: TOKEN_INCLUDE,
    });
    if (!token) return next(new AppError(404, ErrorCode.TOKEN_NOT_FOUND, 'Token not found'));

    const { doctor, waiting, called } = await buildDoctorContext(token.doctorId, token.serviceDate);
    const etaMap = computeQueueEtas(doctor, waiting, called);

    res.json(fmtTokenPublic(token, etaMap.get(tokenId) ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── E14  GET /public/display/:departmentId ──────────────────────────────────

router.get('/display/:departmentId', async (req, res, next) => {
  try {
    const today    = getHospitalDate();
    const snapshot = await buildDisplaySnapshotForDept(req.params.departmentId, today);
    if (!snapshot) return next(new AppError(404, ErrorCode.DEPARTMENT_NOT_FOUND, 'Department not found'));
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;
