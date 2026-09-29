import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api.js';
import { subscribe, unsubscribe, on, onConnectionChange, getConnectionState } from '@/lib/socket.js';
import { SOCKET_EVENTS, rooms } from '@/lib/contract.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';
import { PriorityBadge } from '@/components/PriorityBadge.jsx';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';

const POLL_INTERVAL_MS = 10_000;
const OFFLINE_GRACE_MS = 5_000;

function formatWait(min) {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  return `~${Math.round(min)} min`;
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ENDED = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

export default function PublicTrack() {
  const { tokenId } = useParams();
  const [searchParams] = useSearchParams();
  const sig = searchParams.get('s') ?? '';

  const [token, setToken] = useState(null);
  const [connState, setConnState] = useState(getConnectionState());
  const [calledAlert, setCalledAlert] = useState(null);
  const [threeAwayAlert, setThreeAwayAlert] = useState(null);
  const [pageStatus, setPageStatus] = useState('loading'); // loading | ready | error

  const pollRef = useRef(null);
  const offlineTimerRef = useRef(null);

  const applyUpdate = useCallback((update) => {
    setToken((prev) => {
      if (prev && update.updatedAt && prev.updatedAt >= update.updatedAt) return prev;
      return update;
    });
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const data = await api.get(`/public/tokens/${tokenId}?s=${encodeURIComponent(sig)}`);
      applyUpdate(data);
    } catch {
      // silent — keep showing last known state
    }
  }, [tokenId, sig, applyUpdate]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollOnce();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!sig) { setPageStatus('error'); return; }

    let mounted = true;
    const room = rooms.tokenPublic(tokenId);

    const offUpdate = on(SOCKET_EVENTS.TOKEN_PUBLIC_UPDATE, (update) => {
      if (update.id === tokenId && mounted) applyUpdate(update);
    });
    const offAlert = on(SOCKET_EVENTS.TOKEN_ALERT, (alert) => {
      if (alert.tokenId === tokenId && mounted) setThreeAwayAlert(alert);
    });
    const offCalled = on(SOCKET_EVENTS.TOKEN_CALLED, (payload) => {
      if (payload.tokenId === tokenId && mounted) setCalledAlert(payload);
    });
    const offEnded = on(SOCKET_EVENTS.TOKEN_ENDED, (payload) => {
      if (payload.tokenId === tokenId && mounted) {
        setToken((prev) => prev ? { ...prev, status: payload.status, endedAt: payload.endedAt } : prev);
      }
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

    subscribe(SOCKET_EVENTS.SUBSCRIBE_TOKEN_PUBLIC, { tokenId, sig }, {
      onSnapshot: (snapshot) => { if (mounted) { applyUpdate(snapshot); setPageStatus('ready'); } },
    }).then(() => {
      if (mounted) setPageStatus('ready');
    }).catch(() => {
      if (!mounted) return;
      // Signature invalid or token not found — fall back to REST for better error message
      pollOnce()
        .then(() => { if (mounted) setPageStatus('ready'); })
        .catch(() => { if (mounted) setPageStatus('error'); });
    });

    return () => {
      mounted = false;
      offUpdate(); offAlert(); offCalled(); offEnded(); offConn();
      unsubscribe(room);
      stopPolling();
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [tokenId, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pageStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (pageStatus === 'error' || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm font-medium text-slate-700">Token not found or link is invalid.</p>
        <p className="text-xs text-slate-400">Check the QR code or URL and try again.</p>
      </div>
    );
  }

  const isEnded = ENDED.includes(token.status);

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 p-4">
      {/* Full-screen called alert */}
      {calledAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-600 p-6 text-white">
          <div className="text-center">
            <p className="text-7xl font-bold tracking-tight">{token.tokenNo}</p>
            <p className="mt-4 text-2xl font-semibold">Please proceed to</p>
            <p className="mt-1 text-4xl font-bold">{calledAlert.room}</p>
            <p className="mt-2 text-lg opacity-90">{calledAlert.doctorName}</p>
            <button
              onClick={() => setCalledAlert(null)}
              className="mt-8 rounded-md bg-white px-6 py-2 font-medium text-emerald-700 hover:bg-emerald-50"
            >
              OK, heading there
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">MediQueue</p>
        <ConnectionPill state={connState} />
      </div>

      {threeAwayAlert && !isEnded && (
        <div className="mb-4 flex items-start justify-between rounded-md bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Almost your turn!</p>
            <p className="mt-0.5 text-xs text-amber-700">{threeAwayAlert.message}</p>
          </div>
          <button
            onClick={() => setThreeAwayAlert(null)}
            className="ml-3 text-lg leading-none text-amber-500 hover:text-amber-700"
          >
            ×
          </button>
        </div>
      )}

      <Card className="mb-4">
        <CardHeader className="flex-row items-start justify-between">
          <CardTitle className="text-4xl font-bold">{token.tokenNo}</CardTitle>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={token.status} />
            {token.priority !== 'NONE' && <PriorityBadge priority={token.priority} />}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Department</p>
            <p className="font-medium">{token.departmentName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Doctor</p>
            <p className="font-medium">{token.doctorName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Room</p>
            <p className="font-medium">{token.room}</p>
          </div>

          {token.status === 'WAITING' && (
            <>
              <div>
                <p className="text-xs text-slate-500">People ahead</p>
                <p className="font-medium">{token.peopleAhead ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Estimated wait</p>
                <p className="text-2xl font-bold text-slate-900">{formatWait(token.estimatedWaitMin)}</p>
              </div>
            </>
          )}

          {token.status === 'CALLED' && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Called at</p>
              <p className="font-semibold text-emerald-700">{formatTime(token.calledAt)}</p>
            </div>
          )}

          {isEnded && (
            <div className="col-span-2">
              <p className="text-xs text-slate-500">Ended at</p>
              <p className="font-medium">{formatTime(token.endedAt)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {token.status === 'CALLED' && !calledAlert && (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-emerald-800">
            Please proceed to {token.room}
          </p>
        </div>
      )}
    </div>
  );
}
