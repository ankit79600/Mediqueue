import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';
import { adminStats as mockAdminStats } from '@/mocks/fixtures.js';
import { setSimulatorStatus as mockSetSimulatorStatus, demoReset as mockDemoReset } from '@/mocks/mockAdminEngine.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';
const socket = USE_MOCKS ? mockSocket : realSocket;

// API_CONTRACT.md E24/E25. TEAM_TASKS.md C7 assigns the simulator toggle +
// demo reset button to this (Staff/Admin) frontend role; the simulator
// *engine* itself (simulator/engine.js) is backend-owned and out of scope.
function setSimulatorRequest(body) {
  return USE_MOCKS ? mockSetSimulatorStatus(body) : api.post('/admin/simulator', body);
}
function demoResetRequest() {
  return USE_MOCKS ? mockDemoReset() : api.post('/admin/demo/reset', {});
}

// SOCKET_CONTRACT.md §2-4: subscribe:admin -> room `admin`, ack snapshot =
// { stats: AdminStats, simulator: SimulatorStatus }; live events on the same
// room: stats:update (raw AdminStats, throttled), simulator:status (raw
// SimulatorStatus), demo:reset (all sockets, {at} — clients clear state,
// re-subscribe, refetch per §6). Stale snapshots (by AdminStats.generatedAt)
// are dropped, same rule as the Staff doctor-queue hook. >5s disconnected ->
// poll E21 (GET /admin/stats) every 10s until reconnected.
export function useAdminStats() {
  const [stats, setStats] = useState(null);
  const [simulator, setSimulator] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState(socket.getConnectionState());
  const [pollingActive, setPollingActive] = useState(false);
  const [actionPending, setActionPending] = useState(null); // null | 'start' | 'stop' | 'reset'
  const [actionError, setActionError] = useState(null);
  const generatedAtRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const offlineTimerRef = useRef(null);

  const applyStats = useCallback((nextStats) => {
    if (!nextStats) return;
    if (generatedAtRef.current && nextStats.generatedAt < generatedAtRef.current) return; // stale, §6
    generatedAtRef.current = nextStats.generatedAt;
    setStats(nextStats);
    setStatus('ready');
    setError(null);
  }, []);

  const applySnapshot = useCallback(
    (snap) => {
      if (!snap?.stats) return;
      applyStats(snap.stats);
      setSimulator(snap.simulator ?? null);
    },
    [applyStats],
  );

  const subscribeAdmin = useCallback(() => {
    return socket
      .subscribe(socket.SOCKET_EVENTS.SUBSCRIBE_ADMIN, {}, { onSnapshot: applySnapshot })
      .catch((err) => {
        setError(err);
        setStatus('error');
      });
  }, [applySnapshot]);

  const fetchOnce = useCallback(async () => {
    try {
      const nextStats = USE_MOCKS ? mockAdminStats : await api.get('/admin/stats');
      applyStats(nextStats);
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [applyStats]);

  useEffect(() => {
    let cancelled = false;
    generatedAtRef.current = null;
    subscribeAdmin();

    const offStats = socket.on(socket.SOCKET_EVENTS.STATS_UPDATE, applyStats);
    const offSimulator = socket.on(socket.SOCKET_EVENTS.SIMULATOR_STATUS, setSimulator);
    const offReset = socket.on(socket.SOCKET_EVENTS.DEMO_RESET, () => {
      if (cancelled) return;
      generatedAtRef.current = null;
      setStats(null);
      setSimulator(null);
      setStatus('loading');
      subscribeAdmin();
    });
    const offConn = socket.onConnectionChange(setConnection);

    return () => {
      cancelled = true;
      socket.unsubscribe(socket.rooms.admin());
      offStats();
      offSimulator();
      offReset();
      offConn();
    };
  }, [subscribeAdmin, applyStats]);

  // Polling fallback per SOCKET_CONTRACT.md §6 — identical pattern to
  // useDoctorQueue.js, against E21 instead of E16.
  useEffect(() => {
    if (connection === 'offline') {
      offlineTimerRef.current = setTimeout(() => {
        setPollingActive(true);
        fetchOnce();
        pollIntervalRef.current = setInterval(fetchOnce, 10000);
      }, 5000);
    }
    return () => {
      clearTimeout(offlineTimerRef.current);
      clearInterval(pollIntervalRef.current);
      setPollingActive(false);
    };
  }, [connection, fetchOnce]);

  const connectionDisplay = connection === 'live' ? 'live' : pollingActive ? 'polling' : connection;

  // Same one-at-a-time pattern as useDoctorQueue.js's queue actions: no
  // client-side simulator/demo logic, just render whatever the response says.
  const runAction = useCallback(async (key, request) => {
    setActionPending(key);
    setActionError(null);
    try {
      const res = await request();
      setActionPending(null);
      return res;
    } catch (err) {
      setActionPending(null);
      setActionError(err);
      throw err;
    }
  }, []);

  const startSimulator = useCallback(
    (speed = 10, arrivalsPerMin = 6) =>
      runAction('start', () => setSimulatorRequest({ action: 'start', speed, arrivalsPerMin })).then(setSimulator),
    [runAction],
  );
  const stopSimulator = useCallback(
    () => runAction('stop', () => setSimulatorRequest({ action: 'stop' })).then(setSimulator),
    [runAction],
  );
  const resetDemo = useCallback(() => runAction('reset', () => demoResetRequest()), [runAction]);

  return {
    stats,
    simulator,
    status,
    error,
    connection: connectionDisplay,
    refetch: subscribeAdmin,
    actionPending,
    actionError,
    clearActionError: () => setActionError(null),
    startSimulator,
    stopSimulator,
    resetDemo,
  };
}
