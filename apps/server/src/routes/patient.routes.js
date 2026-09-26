import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requirePatient } from '../middleware/auth.js';
import { getPatient, updatePatient } from '../services/auth.service.js';

const router = Router();

// ─── SCHEMAS ──────────────────────────────────────────────────────────────────

const updateProfileBody = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  age: z.coerce.number().int('Age must be an integer').min(0).max(120),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  consent: z.boolean({ required_error: 'consent is required' }),
});

// ─── E5  GET /patients/me ─────────────────────────────────────────────────────
router.get('/patients/me', requirePatient, async (req, res, next) => {
  try {
    res.json(await getPatient(req.user.sub));
  } catch (err) {
    next(err);
  }
});

// ─── E6  PUT /patients/me ─────────────────────────────────────────────────────
router.put(
  '/patients/me',
  requirePatient,
  validate({ body: updateProfileBody }),
  async (req, res, next) => {
    try {
      res.json(await updatePatient(req.user.sub, req.body));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
