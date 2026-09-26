import jwt from 'jsonwebtoken';
import config from '../config.js';
import { AppError } from './error.js';
import { ErrorCode } from '@mediqueue/shared';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function extractBearer(req) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
}

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────

/**
 * Sets req.user if a valid Bearer JWT is present; never rejects.
 * Used on public routes that optionally personalise for logged-in users.
 */
export function optionalAuth(req, res, next) {
  const raw = extractBearer(req);
  if (raw) req.user = verifyJwt(raw) ?? null;
  next();
}

/**
 * Requires a valid JWT with role = "PATIENT".
 * Rejects with 401 UNAUTHENTICATED on missing / invalid / expired tokens.
 */
export function requirePatient(req, res, next) {
  const raw = extractBearer(req);
  if (!raw) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Authentication required'));

  const payload = verifyJwt(raw);
  if (!payload)        return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid or expired token'));
  if (payload.role !== 'PATIENT') return next(new AppError(403, ErrorCode.FORBIDDEN, 'Patient access only'));

  req.user = payload;
  next();
}

/**
 * Requires a valid JWT with role = "STAFF" OR "ADMIN".
 * Does NOT enforce the doctorId ownership check — use requireDoctorAccess() for that.
 */
export function requireStaff(req, res, next) {
  const raw = extractBearer(req);
  if (!raw) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Authentication required'));

  const payload = verifyJwt(raw);
  if (!payload) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid or expired token'));
  if (payload.role !== 'STAFF' && payload.role !== 'ADMIN') {
    return next(new AppError(403, ErrorCode.FORBIDDEN, 'Staff access only'));
  }

  req.user = payload;
  next();
}

/**
 * Requires a valid JWT with role = "ADMIN" only.
 */
export function requireAdmin(req, res, next) {
  const raw = extractBearer(req);
  if (!raw) return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Authentication required'));

  const payload = verifyJwt(raw);
  if (!payload)              return next(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Invalid or expired token'));
  if (payload.role !== 'ADMIN') return next(new AppError(403, ErrorCode.FORBIDDEN, 'Admin access only'));

  req.user = payload;
  next();
}

/**
 * Requires a valid X-Kiosk-Key header matching config.KIOSK_KEY.
 */
export function requireKioskKey(req, res, next) {
  const key = req.headers['x-kiosk-key'];
  if (!key || key !== config.KIOSK_KEY) {
    return next(new AppError(401, ErrorCode.INVALID_KIOSK_KEY, 'Invalid or missing kiosk key'));
  }
  next();
}

/**
 * Doctor-ownership guard — compose after requireStaff.
 *
 * STAFF: JWT doctorId must match req.params[paramName].
 * ADMIN: always allowed.
 *
 * Used on routes like GET /staff/doctors/:doctorId/queue (API_CONTRACT E16–E17).
 * Token-level ownership (E18–E20) is checked inside the route handler after
 * fetching the token from the DB.
 *
 * @param {string} paramName  URL parameter holding the doctorId (default 'doctorId')
 */
export function requireDoctorAccess(paramName = 'doctorId') {
  return (req, res, next) => {
    if (req.user.role === 'ADMIN') return next();
    if (req.user.doctorId !== req.params[paramName]) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'You can only access your own doctor queue'));
    }
    next();
  };
}
