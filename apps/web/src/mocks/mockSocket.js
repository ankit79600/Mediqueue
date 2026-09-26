// Fake Socket.IO client with the exact same exported surface as ../lib/socket.js,
// so a consumer can switch between the two with one import:
//
//   import * as realSocket from '@/lib/socket.js';
//   import * as mockSocket from '@/mocks/mockSocket.js';
//   const socket = import.meta.env.VITE_USE_MOCKS === 'true' ? mockSocket : realSocket;
//
// Kept deliberately separate from lib/socket.js (no mock-awareness in the real
// client) per the project's mock/real separation rule.
import { SOCKET_EVENTS, rooms } from '../lib/contract.js';
import { adminStats, simulatorStatus } from './fixtures.js';
import { getSnapshot } from './mockQueueEngine.js';

export { SOCKET_EVENTS, rooms };

const SNAPSHOT_BY_EVENT = {
  // Sourced from mockQueueEngine (not the static fixture) so the initial
  // snapshot and every later queue action read/write the same mutable state.
  [SOCKET_EVENTS.SUBSCRIBE_DOCTOR]: (payload) => {
    const doctorId = payload?.doctorId ?? 'doc-gm-1';
    return { room: rooms.doctor(doctorId), snapshot: getSnapshot(doctorId) };
  },
  [SOCKET_EVENTS.SUBSCRIBE_ADMIN]: () => ({
    room: rooms.admin(),
    snapshot: { stats: adminStats, simulator: simulatorStatus },
  }),
};

let connectionState = 'live';
const connectionListeners = new Set();
const eventListeners = new Map(); // event -> Set(handler)

function setConnectionState(next) {
  if (next === connectionState) return;
  connectionState = next;
  connectionListeners.forEach((cb) => cb(connectionState));
}

export function subscribe(event, payload, { onSnapshot } = {}) {
  const build = SNAPSHOT_BY_EVENT[event];
  console.debug('[mockSocket] subscribe', event, payload);
  return new Promise((resolve, reject) => {
    if (!build) {
      reject(new Error(`mockSocket: no fixture wired for "${event}"`));
      return;
    }
    const ack = { ok: true, ...build(payload) };
    onSnapshot?.(ack.snapshot);
    resolve(ack);
  });
}

export function unsubscribe(room) {
  console.debug('[mockSocket] unsubscribe', room);
  // no-op otherwise: fixtures don't hold live room membership
}

export function on(event, handler) {
  if (!eventListeners.has(event)) eventListeners.set(event, new Set());
  eventListeners.get(event).add(handler);
  return () => eventListeners.get(event)?.delete(handler);
}

/** Test helper: push a fake server event to anything listening via on(). */
export function emit(event, payload) {
  eventListeners.get(event)?.forEach((handler) => handler(payload));
}

export function getConnectionState() {
  return connectionState;
}

export function onConnectionChange(handler) {
  connectionListeners.add(handler);
  return () => connectionListeners.delete(handler);
}

export function connect() {
  setConnectionState('live');
}

/** Test-only: drive SOCKET_CONTRACT.md §6's polling-fallback / reconnect path
 * without a real Socket.IO server. Not used by any production code path. */
export function simulateOffline() {
  setConnectionState('offline');
}
export function simulateOnline() {
  setConnectionState('live');
}
