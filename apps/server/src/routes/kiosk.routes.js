import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { validate } from '../middleware/validate.js';
import { requireKioskKey } from '../middleware/auth.js';
import { kioskLimiter } from '../middleware/rateLimit.js';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas, TOKEN_INCLUDE } from '../services/eta.service.js';
import { createToken } from '../services/queue.service.js';
import { fmtToken } from '../presenter.js';
import { getIo } from '../realtime/io.js';
import { flush } from '../realtime/emitters.js';

const router = Router();

const kioskTokenBody = z.object({
  name:         z.string().min(2).max(80),
  phone:        z.string().regex(/^[6-9]\d{9}$/, 'Phone must be a 10-digit Indian mobile number').optional(),
  age:          z.coerce.number().int().min(0).max(120).optional(),
  departmentId: z.string().uuid(),
  doctorId:     z.string().uuid().nullable().default(null),
  priority:     z.enum(['NONE', 'ELDERLY', 'PREGNANT', 'EMERGENCY']).default('NONE'),
});

// ─── E15  POST /kiosk/tokens ──────────────────────────────────────────────────

router.post(
  '/tokens',
  requireKioskKey,
  kioskLimiter,
  validate({ body: kioskTokenBody }),
  async (req, res, next) => {
    try {
      const { name, phone, age, departmentId, doctorId, priority } = req.body;

      // Reuse existing patient by phone, or create a walk-in patient
      let patient = phone ? await prisma.patient.findUnique({ where: { phone } }) : null;
      if (!patient) {
        patient = await prisma.patient.create({
          data: {
            phone:     phone ?? null,
            name,
            age:       age  ?? null,
            consentAt: new Date(), // verbal consent at kiosk
            isWalkIn:  true,
          },
        });
      }

      // Auto-ELDERLY for age >= 60
      const resolvedPriority =
        age != null && age >= 60 && priority === 'NONE' ? 'ELDERLY' : priority;

      const { token: raw, changes } = await createToken(patient.id, {
        departmentId,
        doctorId:         doctorId ?? null,
        type:             'KIOSK',
        slotId:           null,
        priority:         resolvedPriority,
        actorType:        'KIOSK',
        actorId:          null,
        skipProfileCheck: true,
      });
      const today = getHospitalDate();
      const [tokenWI, ctx] = await Promise.all([
        prisma.token.findUnique({ where: { id: raw.id }, include: TOKEN_INCLUDE }),
        buildDoctorContext(raw.doctorId, today),
      ]);
      const etaMap    = computeQueueEtas(ctx.doctor, ctx.waiting, ctx.called);
      const eta       = etaMap.get(raw.id) ?? null;
      const tokenShape = fmtToken(tokenWI, eta);

      const dept = await prisma.department.findUnique({ where: { id: departmentId } });

      flush(getIo(), changes).catch(err => console.error('[flush] E15:', err.message));

      res.status(201).json({
        token: tokenShape,
        print: {
          tokenNo:          raw.tokenNo,
          departmentName:   dept.name,
          doctorName:       ctx.doctor.name,
          room:             ctx.doctor.room,
          position:         eta?.position        ?? null,
          estimatedWaitMin: eta?.estimatedWaitMin ?? null,
          trackUrl:         tokenShape.trackUrl,
          issuedAt:         tokenShape.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
