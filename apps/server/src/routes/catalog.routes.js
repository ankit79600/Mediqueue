import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode } from '@mediqueue/shared';
import { getHospitalDate } from '../utils.js';
import { buildDoctorContext, computeQueueEtas } from '../services/eta.service.js';
import { fmtSlot, buildDepartmentShape } from '../presenter.js';

const router = Router();

// ─── E7  GET /departments ─────────────────────────────────────────────────────

router.get('/departments', async (req, res, next) => {
  try {
    const today = getHospitalDate();

    const [depts, doctors] = await Promise.all([
      prisma.department.findMany({ orderBy: { displayOrder: 'asc' } }),
      prisma.doctor.findMany({ where: { isActive: true } }),
    ]);

    // Build ETA context for every active doctor in parallel
    const ctxResults = await Promise.all(
      doctors.map(d =>
        buildDoctorContext(d.id, today).then(ctx => ({ doctorId: d.id, ...ctx }))
      )
    );

    const etasByDoctor = new Map(
      ctxResults.map(({ doctorId, doctor, waiting, called }) => [
        doctorId,
        { waiting, called, etaMap: computeQueueEtas(doctor, waiting, called) },
      ])
    );

    const departments = depts.map(dept => {
      const deptDoctors = doctors.filter(d => d.departmentId === dept.id);
      const allWaiting  = deptDoctors.flatMap(d => etasByDoctor.get(d.id)?.waiting ?? []);
      return buildDepartmentShape(dept, deptDoctors, allWaiting, etasByDoctor);
    });

    res.json({ departments, serviceDate: today.toISOString().slice(0, 10) });
  } catch (err) {
    next(err);
  }
});

// ─── E8  GET /doctors/:doctorId/slots?date=YYYY-MM-DD ─────────────────────────

const slotsQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
});

router.get('/doctors/:doctorId/slots', validate({ query: slotsQuery }), async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const today        = getHospitalDate();
    const tomorrow     = new Date(today.getTime() + 86_400_000);

    let serviceDate;
    if (!req.query.date) {
      serviceDate = today;
    } else {
      serviceDate = new Date(req.query.date);
      if (
        serviceDate.getTime() !== today.getTime() &&
        serviceDate.getTime() !== tomorrow.getTime()
      ) {
        return next(new AppError(400, ErrorCode.VALIDATION_ERROR, 'date must be today or tomorrow', {
          fields: { date: 'Only today or tomorrow are allowed' },
        }));
      }
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) return next(new AppError(404, ErrorCode.DOCTOR_NOT_FOUND, 'Doctor not found'));

    const slots = await prisma.slot.findMany({
      where:   { doctorId, serviceDate },
      orderBy: { startTime: 'asc' },
    });

    res.json({
      doctorId,
      date:  serviceDate.toISOString().slice(0, 10),
      slots: slots.map(fmtSlot),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
