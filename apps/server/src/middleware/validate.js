import { AppError } from './error.js';
import { ErrorCode } from '@mediqueue/shared';

/**
 * Zod validation middleware — API_CONTRACT §3 (VALIDATION_ERROR).
 *
 * Usage:
 *   router.post('/path', validate({ body: z.object({…}), query: z.object({…}) }), handler)
 *
 * On success, the parsed (and coerced) values replace req.body / req.query / req.params.
 * On failure, calls next() with 400 AppError containing { fields: { fieldName: message } }.
 */
export function validate(schemas = {}) {
  return (req, res, next) => {
    const fields = {};

    for (const section of ['body', 'query', 'params']) {
      const schema = schemas[section];
      if (!schema) continue;

      const result = schema.safeParse(req[section] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.join('.') || section;
          if (!fields[key]) fields[key] = issue.message; // first error per field
        }
      } else {
        req[section] = result.data; // allow type coercions (e.g. string → number)
      }
    }

    if (Object.keys(fields).length > 0) {
      return next(new AppError(400, ErrorCode.VALIDATION_ERROR, 'Validation failed', { fields }));
    }

    next();
  };
}
