// Local mirror of packages/shared/events.js (SOCKET_CONTRACT.md §2-4).
// packages/shared does not exist yet in this branch (it is Member D's / the
// platform owner's folder per TEAM_TASKS.md file-ownership rules) — these
// constants are copied verbatim from SOCKET_CONTRACT.md so nothing here is
// invented. Replace this file's usages with `import { ... } from '@mediqueue/shared'`
// once that package is added to the monorepo.

export const SOCKET_EVENTS = Object.freeze({
  // Client -> Server (subscribe/unsubscribe)
  SUBSCRIBE_TOKEN: 'subscribe:token',
  SUBSCRIBE_TOKEN_PUBLIC: 'subscribe:tokenPublic',
  SUBSCRIBE_DOCTOR: 'subscribe:doctor',
  SUBSCRIBE_DEPT: 'subscribe:dept',
  SUBSCRIBE_ADMIN: 'subscribe:admin',
  UNSUBSCRIBE: 'unsubscribe',

  // Server -> Client
  TOKEN_UPDATE: 'token:update',
  TOKEN_PUBLIC_UPDATE: 'tokenPublic:update',
  TOKEN_ALERT: 'token:alert',
  TOKEN_CALLED: 'token:called',
  TOKEN_SKIPPED: 'token:skipped',
  TOKEN_ENDED: 'token:ended',
  QUEUE_UPDATE: 'queue:update',
  DISPLAY_UPDATE: 'display:update',
  STATS_UPDATE: 'stats:update',
  NOTIFICATION_NEW: 'notification:new',
  SIMULATOR_STATUS: 'simulator:status',
  DEMO_RESET: 'demo:reset',
});

export const rooms = Object.freeze({
  token: (id) => `token:${id}`,
  tokenPublic: (id) => `tokenpub:${id}`,
  doctor: (id) => `doctor:${id}`,
  dept: (id) => `dept:${id}`,
  admin: () => 'admin',
});
