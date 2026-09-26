import { ErrorCode } from '@mediqueue/shared';

// All deliberate HTTP errors thrown within route handlers / services.
export class AppError extends Error {
  /**
   * @param {number} status   HTTP status code
   * @param {string} code     One of ErrorCode (API_CONTRACT §3)
   * @param {string} message  Human-readable text
   * @param {object} details  Optional extra data (e.g. { fields: { phone: '…' } })
   */
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Express 404 handler — mount after all routes */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: 'Route not found', details: {} },
  });
}

/** Express error handler — must be the last app.use() call (4-arg signature required) */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    // Unique constraint violation — surface as a generic 409 so services can
    // catch the specific case first; this is a last-resort fallback.
    return res.status(409).json({
      error: { code: ErrorCode.INVALID_STATE, message: 'Duplicate record', details: {} },
    });
  }

  // Unknown error — log and hide internals from clients
  console.error('[error]', err);
  return res.status(500).json({
    error: { code: ErrorCode.INTERNAL, message: 'Internal server error', details: {} },
  });
}
