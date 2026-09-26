import rateLimit from 'express-rate-limit';
import { ErrorCode } from '@mediqueue/shared';

// Builds a consistent 429 error response matching the API error envelope.
function handler(code, message) {
  return (req, res) => {
    res.status(429).json({ error: { code, message, details: {} } });
  };
}

// ─── OTP RATE LIMITS (API_CONTRACT §5) ────────────────────────────────────────

/**
 * Per-phone: 1 request per 30 s.
 * Mount AFTER express.json() so req.body.phone is available.
 */
export const otpPhone30sLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 1,
  keyGenerator: (req) => `phone:${req.body?.phone ?? req.ip}`,
  handler: handler(ErrorCode.OTP_RATE_LIMITED, 'Please wait 30 seconds before requesting a new OTP'),
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-phone: 5 requests per 10 min.
 * Mount AFTER express.json().
 */
export const otpPhone10MinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `phone10:${req.body?.phone ?? req.ip}`,
  handler: handler(ErrorCode.OTP_RATE_LIMITED, 'Too many OTP requests for this number, please try again later'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-IP: 20 requests per 10 min.
 */
export const otpIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `ip:${req.ip}`,
  handler: handler(ErrorCode.OTP_RATE_LIMITED, 'Too many OTP requests from this IP'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-kiosk-key: 60 requests per minute.
 * Mount on POST /kiosk/tokens.
 */
export const kioskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => `kiosk:${req.headers['x-kiosk-key'] ?? req.ip}`,
  handler: handler(ErrorCode.RATE_LIMITED, 'Kiosk rate limit exceeded, slow down'),
  standardHeaders: true,
  legacyHeaders: false,
});
