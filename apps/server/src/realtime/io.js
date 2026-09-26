/**
 * io.js — Socket.IO server singleton.
 *
 * Call initIo(httpServer) once at startup (index.js).
 * Call getIo() anywhere in the application to emit events.
 *
 * SOCKET_CONTRACT §1, §7
 */

import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import config from '../config.js';
import { registerHandlers } from './handlers.js';
import { etaTick } from './emitters.js';

let _io = null;

const ETA_TICK_MS = 30_000; // SOCKET_CONTRACT §5 T7

export function initIo(httpServer) {
  _io = new Server(httpServer, {
    cors: {
      origin:  config.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    // Path defaults to /socket.io (matches SOCKET_CONTRACT §1)
  });

  // ── Handshake auth middleware ─────────────────────────────────────────────
  // SOCKET_CONTRACT §1: optional JWT; invalid → connect_error('UNAUTHENTICATED')
  _io.use((socket, next) => {
    const token = socket.handshake.auth?.accessToken;
    if (!token) {
      socket.data.user = null; // anonymous (display boards, public tracking)
      return next();
    }
    try {
      socket.data.user = jwt.verify(token, config.JWT_SECRET);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  // ── Per-socket event handlers ─────────────────────────────────────────────
  _io.on('connection', socket => {
    if (config.NODE_ENV !== 'production') {
      const role = socket.data.user?.role ?? 'anon';
      console.log(`[socket] connected ${socket.id} (${role})`);
    }
    registerHandlers(_io, socket);
    socket.on('disconnect', () => {
      if (config.NODE_ENV !== 'production') {
        console.log(`[socket] disconnected ${socket.id}`);
      }
    });
  });

  // ── T7 ETA tick ───────────────────────────────────────────────────────────
  const tick = setInterval(() => etaTick(_io), ETA_TICK_MS);
  tick.unref(); // don't prevent graceful shutdown

  return _io;
}

export function getIo() {
  if (!_io) throw new Error('[io] Socket.IO not initialized — call initIo(httpServer) first');
  return _io;
}
