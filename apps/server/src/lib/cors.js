/**
 * Build a cors `origin` option from a comma-separated string.
 *
 * Supports:
 *   - Exact origins:        "https://web-code-bits.vercel.app"
 *   - Wildcard subdomains:  "*.vercel.app"  (any subdomain of vercel.app)
 *   - All origins:          "*"
 *
 * Returns a string (single exact), array (multiple exact), or function
 * (when wildcards are present) — all accepted by `cors` and `socket.io`.
 */
export function buildCorsOrigin(raw) {
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0) return false;

  const hasWildcard = entries.some((e) => e === '*' || e.startsWith('*.'));
  if (!hasWildcard) {
    return entries.length === 1 ? entries[0] : entries;
  }

  return function corsOriginFn(origin, callback) {
    // Non-browser callers (curl, server-to-server) have no Origin header.
    if (!origin) return callback(null, true);

    for (const entry of entries) {
      if (entry === '*') return callback(null, true);
      if (entry === origin) return callback(null, true);
      if (entry.startsWith('*.')) {
        const domain = entry.slice(2); // e.g. "vercel.app"
        if (origin.endsWith('.' + domain)) return callback(null, true);
      }
    }

    const err = Object.assign(new Error(`CORS: ${origin} not allowed`), { status: 403 });
    callback(err);
  };
}
