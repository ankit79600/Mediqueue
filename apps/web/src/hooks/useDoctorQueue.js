import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';
import { mockCallNext, mockSkip, mockNoShow, mockComplete, getSnapshot } from '@/mocks/mockQueueEngine.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const socket = USE_MOCKS ? mockSocket : realSocket;

// API_CONTRACT.md E17-E20. Every action returns { token, queue, result? } on
// success — the frontend never computes the new queue state itself, it just
// renders whatever the server (or, in mock mode, the mock engine standing in
// for it) returns.
function callNextRequest(doctorId) {
  return USE_MOCKS ? mockCallNext(doctorId) : api.post(`/staff/doctors/${doctorId}/call-next`, {});
}
function skipRequest(tokenId) {
  return USE_MOCKS ? mockSkip(tokenId) : api.post(`/staff/tokens/${tokenId}/skip`, {});
}
function noShowRequest(tokenId) {
  return USE_MOCKS ? mockNoShow(tokenId) : api.post(`/staff/tokens/${tokenId}/no-show`, {});
}
function completeRequest(tokenId) {
  return USE_MOCKS ? mockComplete(tokenId) : api.post(`/staff/tokens/${tokenId}/complete`, {});
}

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
  const [actionPending, setActionPending] = useState(null); // null | 'call-next' | `skip:${id}` | ...
  const [actionError, setActionError] = useState(null);
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
      const snap = USE_MOCKS ? getSnapshot(doctorId) : await api.get(`/staff/doctors/${doctorId}/queue`);
      applySnapshot(snap);
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [doctorId, applySnapshot]);

  // Runs one action at a time; on success the returned `queue` replaces the
  // displayed snapshot (through the same stale-payload guard as socket updates);
  // on failure the current UI is left exactly as-is and the error is surfaced
  // separately (§ "preserve the current UI when the action fails").
  const runAction = useCallback(
    async (key, request) => {
      setActionPending(key);
      setActionError(null);
      try {
        const res = await request();
        applySnapshot(res.queue);
        setActionPending(null);
        return res;
      } catch (err) {
        setActionPending(null);
        setActionError(err);
        // Error responses carry no `queue` payload (API_CONTRACT.md §4 E17-E20) —
        // on a 409 the safest resync is to re-fetch current server truth rather
        // than guess at it.
        if (err?.status === 409) fetchOnce();
        throw err;
      }
    },
    [applySnapshot, fetchOnce],
  );

  const callNext = useCallback(
    () => runAction('call-next', () => callNextRequest(doctorId)),
    [doctorId, runAction],
  );
  const skip = useCallback((tokenId) => runAction(`skip:${tokenId}`, () => skipRequest(tokenId)), [runAction]);
  const noShow = useCallback(
    (tokenId) => runAction(`no-show:${tokenId}`, () => noShowRequest(tokenId)),
    [runAction],
  );
  const complete = useCallback(
    (tokenId) => runAction(`complete:${tokenId}`, () => completeRequest(tokenId)),
    [runAction],
  );

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

  return {
    snapshot,
    status,
    error,
    connection,
    refetch: fetchOnce,
    actionPending,
    actionError,
    clearActionError: () => setActionError(null),
    callNext,
    skip,
    noShow,
    complete,
  };
}
