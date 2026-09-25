// Generic REST client. API_CONTRACT.md §1: base URL = VITE_API_URL, JSON camelCase,
// Authorization: Bearer <jwt>, every non-2xx body is { error: { code, message, details? } }.
import { getToken, clearToken } from './auth.js';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Registered by the app shell so a 401 can trigger a redirect without this
// module depending on react-router. See FINAL_PROJECT_STRUCTURE §2 lib/api.js.
let unauthorizedHandler = null;
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function request(method, path, { body, headers, signal } = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = payload?.error ?? {};
    if (res.status === 401) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? res.statusText, err.details);
  }

  return payload;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  delete: (path, opts) => request('DELETE', path, opts),
};
