import { useCallback, useEffect, useRef, useState } from 'react';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const socket = USE_MOCKS ? mockSocket : realSocket;

// SOCKET_CONTRACT.md §3: subscribe:admin -> room `admin`, ack snapshot =
// { stats: AdminStats, simulator: SimulatorStatus } (API_CONTRACT.md §2.9/E23).
//
// Subphase 3A only wires the initial snapshot + connection state (dashboard
// shell). Live stats:update / notification:new / simulator:status handling
// and the E21 polling fallback are added in subphase 3D (Admin realtime).
export function useAdminStats() {
  const [stats, setStats] = useState(null);
  const [simulator, setSimulator] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState(socket.getConnectionState());
  const generatedAtRef = useRef(null);

  const applySnapshot = useCallback((snap) => {
    if (!snap?.stats) return;
    if (generatedAtRef.current && snap.stats.generatedAt < generatedAtRef.current) return; // stale, §6
    generatedAtRef.current = snap.stats.generatedAt;
    setStats(snap.stats);
    setSimulator(snap.simulator ?? null);
    setStatus('ready');
    setError(null);
  }, []);

  const subscribeAdmin = useCallback(() => {
    return socket
      .subscribe(socket.SOCKET_EVENTS.SUBSCRIBE_ADMIN, {}, { onSnapshot: applySnapshot })
      .catch((err) => {
        setError(err);
        setStatus('error');
      });
  }, [applySnapshot]);

  useEffect(() => {
    generatedAtRef.current = null;
    subscribeAdmin();

    const offConn = socket.onConnectionChange(setConnection);

    return () => {
      socket.unsubscribe(socket.rooms.admin());
      offConn();
    };
  }, [subscribeAdmin]);

  return { stats, simulator, status, error, connection, refetch: subscribeAdmin };
}
