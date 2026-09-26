import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { otpPhone30sLimiter, otpPhone10MinLimiter, otpIpLimiter } from '../middleware/rateLimit.js';
import { requestOtp, verifyOtp, staffLogin } from '../services/auth.service.js';

const router = Router();

// ─── SCHEMAS ──────────────────────────────────────────────────────────────────

// Phone format check is done in the service (gives INVALID_PHONE, not VALIDATION_ERROR)
const otpRequestBody = z.object({
  phone: z.string().min(1, 'phone is required'),
});

const otpVerifyBody = z.object({
  phone: z.string().min(1, 'phone is required'),
  code: z.string().regex(/^\d{6}$/, 'code must be exactly 6 digits'),
});

const staffLoginBody = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

// ─── E2  POST /auth/otp/request ───────────────────────────────────────────────
// Rate limits (API_CONTRACT §5): 1/30 s per phone, 5/10 min per phone, 20/10 min per IP.
// Limiters run before validate so they key on req.body.phone even on bad payloads.
router.post(
  '/otp/request',
  otpPhone30sLimiter,
  otpPhone10MinLimiter,
  otpIpLimiter,
  validate({ body: otpRequestBody }),
  async (req, res, next) => {
    try {
      res.json(await requestOtp(req.body.phone));
    } catch (err) {
      next(err);
    }
  },
);

// ─── E3  POST /auth/otp/verify ────────────────────────────────────────────────
// Per-OTP attempt limit (max 5) is enforced inside verifyOtp() via otp.attempts.
router.post(
  '/otp/verify',
  validate({ body: otpVerifyBody }),
  async (req, res, next) => {
    try {
      res.json(await verifyOtp(req.body.phone, req.body.code));
    } catch (err) {
      next(err);
    }
  },
);

// ─── E4  POST /auth/staff/login ───────────────────────────────────────────────
router.post(
  '/staff/login',
  validate({ body: staffLoginBody }),
  async (req, res, next) => {
    try {
      res.json(await staffLogin(req.body.username, req.body.password));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
