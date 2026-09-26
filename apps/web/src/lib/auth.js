// JWT storage + role guards.
// Claim shapes: API_CONTRACT.md §1 "JWT payloads" —
//   Patient: { sub, role: "PATIENT", iat, exp }
//   Staff:   { sub, role: "STAFF", doctorId, deptId, iat, exp }
//   Admin:   { sub, role: "ADMIN", doctorId: null, deptId: null, iat, exp }
const STORAGE_KEY = 'mediqueue.accessToken';

function safeLocalStorage() {
  try {
    const testKey = '__mediqueue_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken() {
  const storage = safeLocalStorage();
  return storage ? storage.getItem(STORAGE_KEY) : null;
}

export function setToken(token) {
  const storage = safeLocalStorage();
  if (storage) storage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  const storage = safeLocalStorage();
  if (storage) storage.removeItem(STORAGE_KEY);
}

// Decodes the JWT payload for UI role/claim checks only.
// Not a verification step — the server is the source of truth for auth.
export function decodeToken(token = getToken()) {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getUser() {
  const claims = decodeToken();
  if (!claims) return null;
  if (claims.exp && Date.now() >= claims.exp * 1000) return null;
  return claims;
}

export function isAuthenticated() {
  return getUser() !== null;
}

export function hasRole(role) {
  const user = getUser();
  if (!user) return false;
  const roles = Array.isArray(role) ? role : [role];
  return roles.includes(user.role);
}

export function logout() {
  clearToken();
}
