// One Socket.IO connection per tab. SOCKET_CONTRACT.md §1, §3, §6:
// - handshake: io(URL, { auth: { accessToken? } }), JWT optional
// - invalid/expired JWT -> connect_error "UNAUTHENTICATED" -> clear token, reconnect anonymously
// - clients never join rooms directly; they emit a subscribe:* event and get an ack
//   { ok: true, room, snapshot } | { ok: false, error }
// - on (re)connect, re-emit every active subscription and replace state with the new ack snapshot
//
// This module only owns the connection + subscribe/unsubscribe/ack + reconnection.
// The >5s-disconnected "switch to REST polling" rule (SOCKET_CONTRACT §6) is
// page-specific (each page polls a different endpoint: E11/E13/E16/E14/E21) and
// is intentionally left to the feature hooks (useDoctorQueue, useAdminStats, ...)
// built in a later phase — this foundation only exposes connection state for them.
import { io } from 'socket.io-client';
import { getToken, clearToken } from './auth.js';
import { SOCKET_EVENTS, rooms } from './contract.js';

export { SOCKET_EVENTS, rooms };

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined = same origin

export class SocketAckError extends Error {
  constructor(error) {
    super(error?.message ?? 'Socket subscribe failed');
    this.code = error?.code ?? 'UNKNOWN';
  }
}

let socket = null;
/** room -> { event, payload, onSnapshot } */
const activeSubscriptions = new Map();
/** 'connecting' | 'live' | 'offline' */
let connectionState = 'connecting';
const connectionListeners = new Set();

function setConnectionState(next) {
  if (next === connectionState) return;
  connectionState = next;
  connectionListeners.forEach((cb) => cb(connectionState));
}

function resubscribeAll() {
  if (!socket) return;
  for (const [room, sub] of activeSubscriptions) {
    socket.emit(sub.event, sub.payload, (ack) => {
      if (ack?.ok) sub.onSnapshot?.(ack.snapshot);
      // A failed re-subscribe (e.g. token expired) leaves the last known
      // snapshot on screen; the caller's own auth/redirect flow handles it.
    });
    void room;
  }
}

function ensureSocket() {
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ accessToken: getToken() ?? undefined }),
  });

  socket.on('connect', () => {
    setConnectionState('live');
    resubscribeAll();
  });
  socket.on('disconnect', () => setConnectionState('offline'));
  socket.on('connect_error', (err) => {
    if (err?.message === 'UNAUTHENTICATED') clearToken();
    setConnectionState('offline');
  });

  return socket;
}

/** Subscribe to a room; resolves with the ack, and calls onSnapshot on every (re)connect snapshot. */
export function subscribe(event, payload, { onSnapshot } = {}) {
  const s = ensureSocket();
  return new Promise((resolve, reject) => {
    s.emit(event, payload, (ack) => {
      if (!ack?.ok) {
        reject(new SocketAckError(ack?.error));
        return;
      }
      activeSubscriptions.set(ack.room, { event, payload, onSnapshot });
      onSnapshot?.(ack.snapshot);
      resolve(ack);
    });
  });
}

export function unsubscribe(room) {
  if (!socket || !activeSubscriptions.has(room)) return;
  activeSubscriptions.delete(room);
  socket.emit(SOCKET_EVENTS.UNSUBSCRIBE, { room });
}

/** Listen for a server -> client event (queue:update, stats:update, ...). Returns an off() fn. */
export function on(event, handler) {
  const s = ensureSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function getConnectionState() {
  return connectionState;
}

/** Returns an unsubscribe fn. */
export function onConnectionChange(handler) {
  connectionListeners.add(handler);
  return () => connectionListeners.delete(handler);
}

export function connect() {
  ensureSocket();
}
