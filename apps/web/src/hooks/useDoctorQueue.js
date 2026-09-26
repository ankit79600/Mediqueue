import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const socket = USE_MOCKS ? mockSocket : realSocket;

// SOCKET_CONTRACT.md: subscribe:doctor -> room doctor:{id}, ack snapshot = QueueSnapshot,
// server event queue:update carries the same QueueSnapshot shape (API_CONTRACT.md §2.7).
// §6 client rules: drop snapshots whose generatedAt is older than the current one;
// after >5s disconnected, fall back to polling E16 (GET /staff/doctors/:id/queue) every 10s.
// Mount a fresh instance per doctorId (e.g. render with key={doctorId} from the
// caller) rather than resetting status/error inside the effect — avoids the
// synchronous setState-in-effect pattern React now flags.
export function useDoctorQueue(doctorId) {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState(socket.getConnectionState());
  const generatedAtRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const offlineTimerRef = useRef(null);

  const applySnapshot = useCallback((snap) => {
    if (!snap) return;
    if (generatedAtRef.current && snap.generatedAt < generatedAtRef.current) return; // stale, §6
    generatedAtRef.current = snap.generatedAt;
    setSnapshot(snap);
    setStatus('ready');
    setError(null);
  }, []);

  const fetchOnce = useCallback(async () => {
    try {
      const snap = await api.get(`/staff/doctors/${doctorId}/queue`);
      applySnapshot(snap);
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [doctorId, applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    generatedAtRef.current = null;

    const room = socket.rooms.doctor(doctorId);

    socket
      .subscribe(socket.SOCKET_EVENTS.SUBSCRIBE_DOCTOR, { doctorId }, { onSnapshot: applySnapshot })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setStatus('error');
        }
      });

    const offUpdate = socket.on(socket.SOCKET_EVENTS.QUEUE_UPDATE, applySnapshot);
    const offConn = socket.onConnectionChange(setConnection);

    return () => {
      cancelled = true;
      socket.unsubscribe(room);
      offUpdate();
      offConn();
      clearTimeout(offlineTimerRef.current);
      clearInterval(pollIntervalRef.current);
    };
  }, [doctorId, applySnapshot]);

  // Polling fallback per SOCKET_CONTRACT.md §6 (only ever triggers against the
  // real socket — mockSocket's connection state is always "live").
  useEffect(() => {
    clearTimeout(offlineTimerRef.current);
    if (connection === 'offline') {
      offlineTimerRef.current = setTimeout(() => {
        fetchOnce();
        pollIntervalRef.current = setInterval(fetchOnce, 10000);
      }, 5000);
    } else {
      clearInterval(pollIntervalRef.current);
    }
    return () => clearTimeout(offlineTimerRef.current);
  }, [connection, fetchOnce]);

  return { snapshot, status, error, connection, refetch: fetchOnce };
}
