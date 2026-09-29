import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api.js';
import { subscribe, unsubscribe, on, onConnectionChange, getConnectionState } from '@/lib/socket.js';
import { SOCKET_EVENTS, rooms } from '@/lib/contract.js';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';

const POLL_INTERVAL_MS = 15_000;
const OFFLINE_GRACE_MS = 5_000;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const PRIORITY_LABEL = { NONE: null, ELDERLY: 'E', PREGNANT: 'P', EMERGENCY: '!' };
const PRIORITY_COLOR = {
  NONE: '',
  ELDERLY: 'text-blue-400',
  PREGNANT: 'text-blue-400',
  EMERGENCY: 'text-red-400',
};

export default function DisplayBoard() {
  const { deptId } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [connState, setConnState] = useState(getConnectionState());
  const [pageStatus, setPageStatus] = useState('loading');

  const pollRef = useRef(null);
  const offlineTimerRef = useRef(null);

  const applySnapshot = useCallback((snap) => {
    setSnapshot((prev) => {
      if (prev && snap.generatedAt && prev.generatedAt >= snap.generatedAt) return prev;
      return snap;
    });
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const data = await api.get(`/public/display/${deptId}`);
      applySnapshot(data);
    } catch {
      // keep last snapshot
    }
  }, [deptId, applySnapshot]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollOnce();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    let mounted = true;
    const room = rooms.dept(deptId);

    const offDisplay = on(SOCKET_EVENTS.DISPLAY_UPDATE, (snap) => {
      if (mounted) applySnapshot(snap);
    });

    // On demo:reset, resubscribe to get a fresh snapshot
    const offReset = on(SOCKET_EVENTS.DEMO_RESET, () => {
      if (!mounted) return;
      unsubscribe(room);
      subscribe(SOCKET_EVENTS.SUBSCRIBE_DEPT, { departmentId: deptId }, {
        onSnapshot: (snap) => { if (mounted) applySnapshot(snap); },
      }).catch(() => {});
    });

    const offConn = onConnectionChange((state) => {
      if (!mounted) return;
      setConnState(state);
      if (state === 'offline') {
        offlineTimerRef.current = setTimeout(() => { if (mounted) startPolling(); }, OFFLINE_GRACE_MS);
      } else {
        if (offlineTimerRef.current) { clearTimeout(offlineTimerRef.current); offlineTimerRef.current = null; }
        stopPolling();
      }
    });

    subscribe(SOCKET_EVENTS.SUBSCRIBE_DEPT, { departmentId: deptId }, {
      onSnapshot: (snap) => { if (mounted) { applySnapshot(snap); setPageStatus('ready'); } },
    }).then(() => {
      if (mounted) setPageStatus('ready');
    }).catch(() => {
      if (!mounted) return;
      pollOnce().then(() => { if (mounted) setPageStatus('ready'); }).catch(() => { if (mounted) setPageStatus('error'); });
    });

    return () => {
      mounted = false;
      offDisplay(); offReset(); offConn();
      unsubscribe(room);
      stopPolling();
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [deptId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pageStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (pageStatus === 'error' || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Department not found.</p>
      </div>
    );
  }

  const { department, nowServing, upNext, queueLength, generatedAt } = snapshot;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 p-6 font-sans text-white">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">MediQueue</p>
          <h1 className="mt-1 text-3xl font-bold text-white">{department.name}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ConnectionPill state={connState} className="border-slate-700 bg-slate-900 text-slate-300" />
          <p className="text-xs text-slate-600">{formatTime(generatedAt)}</p>
        </div>
      </div>

      {/* Now Serving */}
      <section className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Now Serving
        </p>
        {nowServing.length === 0 ? (
          <div className="rounded-lg bg-slate-900 px-6 py-5 text-center text-slate-500">
            No patients currently being served
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nowServing.map((entry) => (
              <div
                key={entry.doctorId}
                className="flex items-center justify-between rounded-lg bg-emerald-950 px-5 py-4"
              >
                <div>
                  <p className="text-xs text-emerald-400">{entry.room}</p>
                  <p className="mt-0.5 text-sm text-emerald-200">{entry.doctorName}</p>
                </div>
                <p className="text-4xl font-bold tracking-tight text-emerald-300">
                  {entry.tokenNo ?? '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Up Next */}
      <section className="flex-1">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Up Next</p>
          <p className="text-xs text-slate-600">{queueLength} waiting total</p>
        </div>
        {upNext.length === 0 ? (
          <div className="rounded-lg bg-slate-900 px-6 py-5 text-center text-slate-500">
            Queue is empty
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {upNext.map((entry, i) => (
              <div
                key={`${entry.tokenNo}-${i}`}
                className="flex items-center justify-between rounded-lg bg-slate-900 px-5 py-3"
              >
                <p className="text-2xl font-bold text-slate-100">{entry.tokenNo}</p>
                <div className="flex items-center gap-3">
                  {entry.priority !== 'NONE' && (
                    <span className={`text-xs font-bold ${PRIORITY_COLOR[entry.priority]}`}>
                      {PRIORITY_LABEL[entry.priority]}
                    </span>
                  )}
                  <div className="text-right">
                    <p className="text-sm text-slate-300">{entry.doctorName}</p>
                    <p className="text-xs text-slate-500">{entry.room}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
