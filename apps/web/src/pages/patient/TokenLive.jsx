import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Stethoscope, X, Loader2, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, ApiError } from '@/lib/api.js';
import { subscribe, unsubscribe, on, onConnectionChange, getConnectionState } from '@/lib/socket.js';
import { SOCKET_EVENTS, rooms } from '@/lib/contract.js';
import { Card, CardContent } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';
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

export default function TokenLive() {
  const { tokenId } = useParams();
  const navigate = useNavigate();

  const [token, setToken] = useState(null);
  const [connState, setConnState] = useState(getConnectionState());
  const [calledAlert, setCalledAlert] = useState(null);
  const [threeAwayAlert, setThreeAwayAlert] = useState(null);
  const [pageStatus, setPageStatus] = useState('loading');
  const [cancelling, setCancelling] = useState(false);

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
      const data = await api.get(`/tokens/${tokenId}`);
      applyUpdate(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/patient/login', { replace: true });
    }
  }, [tokenId, applyUpdate, navigate]);

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
    const room = rooms.token(tokenId);

    const offUpdate = on(SOCKET_EVENTS.TOKEN_UPDATE, (update) => {
      if (update.id === tokenId && mounted) applyUpdate(update);
    });
    const offAlert = on(SOCKET_EVENTS.TOKEN_ALERT, (alert) => {
      if (alert.tokenId === tokenId && mounted) setThreeAwayAlert(alert);
    });
    const offCalled = on(SOCKET_EVENTS.TOKEN_CALLED, (payload) => {
      if (payload.tokenId === tokenId && mounted) setCalledAlert(payload);
    });
    const offSkipped = on(SOCKET_EVENTS.TOKEN_SKIPPED, (payload) => {
      if (payload.tokenId === tokenId && mounted) setCalledAlert(null);
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

    subscribe(SOCKET_EVENTS.SUBSCRIBE_TOKEN, { tokenId }, {
      onSnapshot: (snapshot) => { if (mounted) { applyUpdate(snapshot); setPageStatus('ready'); } },
    }).then(() => {
      if (mounted) setPageStatus('ready');
    }).catch((err) => {
      if (!mounted) return;
      if (err.code === 'UNAUTHENTICATED' || err.code === 'FORBIDDEN') {
        navigate('/patient/login', { replace: true });
      } else {
        pollOnce().then(() => { if (mounted) setPageStatus('ready'); }).catch(() => { if (mounted) setPageStatus('error'); });
      }
    });

    return () => {
      mounted = false;
      offUpdate(); offAlert(); offCalled(); offSkipped(); offEnded(); offConn();
      unsubscribe(room);
      stopPolling();
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [tokenId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.delete(`/tokens/${tokenId}`);
      navigate('/patient/tokens', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_STATE') navigate('/patient/tokens', { replace: true });
    } finally {
      setCancelling(false);
    }
  }

  if (pageStatus === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#5b6b82]">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-2 text-sm">Loading…</p>
      </div>
    );
  }

  if (pageStatus === 'error' || !token) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm text-[#5b6b82]">Could not load this token.</p>
        <Button onClick={() => navigate('/patient/tokens')}>Back to tokens</Button>
      </div>
    );
  }

  const isEnded = ENDED.includes(token.status);

  return (
    <div className="flex flex-col gap-4">
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
              className="mt-8 rounded-xl bg-white px-6 py-2.5 font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              OK, heading there
            </button>
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/patient/tokens')}
          className="flex items-center gap-1.5 text-sm text-[#5b6b82] hover:text-[#0f172a] transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
        <ConnectionPill state={connState} />
      </div>

      {/* 3-away alert */}
      {threeAwayAlert && !isEnded && (
        <div className="flex items-start justify-between rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">Almost your turn!</p>
            <p className="mt-0.5 text-xs text-amber-700">{threeAwayAlert.message}</p>
          </div>
          <button onClick={() => setThreeAwayAlert(null)} className="ml-3 text-amber-500 hover:text-amber-700">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Token card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-5xl font-bold tracking-tight text-[#0f172a]">{token.tokenNo}</p>
            <StatusBadge status={token.status} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#e0f2fe]">
                <Stethoscope className="size-4 text-[#0284c7]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-[#5b6b82]">Doctor</p>
                <p className="font-medium text-[#0f172a]">{token.doctorName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#e0f2fe]">
                <MapPin className="size-4 text-[#0284c7]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-[#5b6b82]">Room</p>
                <p className="font-medium text-[#0f172a]">{token.room}</p>
              </div>
            </div>
          </div>

          {token.status === 'WAITING' && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#f4f7fb] p-4">
              <div>
                <p className="text-xs text-[#5b6b82]">People ahead</p>
                <p className="text-2xl font-bold text-[#0f172a]">{token.peopleAhead ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[#5b6b82]">Est. wait</p>
                <div className="flex items-end gap-1">
                  <Clock className="mb-0.5 size-4 text-[#0284c7]" aria-hidden="true" />
                  <p className="text-2xl font-bold text-[#0284c7]">{formatWait(token.estimatedWaitMin)}</p>
                </div>
              </div>
            </div>
          )}

          {token.status === 'CALLED' && (
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-emerald-700">
                Please proceed to {token.room} — called at {formatTime(token.calledAt)}
              </p>
            </div>
          )}

          {isEnded && (
            <div className="mt-4 rounded-xl bg-[#eef2f7] px-4 py-3 text-center">
              <p className="text-sm text-[#5b6b82]">Token ended at {formatTime(token.endedAt)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* QR code card */}
      {token.trackUrl && !isEnded && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#e0f2fe]">
                <QrCode className="size-4 text-[#0284c7]" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0f172a]">Share your token</p>
                <p className="text-xs text-[#5b6b82]">Family can track live — no login needed</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#e2e8f0]">
                <QRCodeSVG
                  value={token.trackUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-lg font-bold tracking-widest text-[#0f172a]">{token.tokenNo}</p>
              <p className="text-center text-xs text-[#5b6b82] max-w-[220px]">
                Scan to see queue position &amp; ETA in real time
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {token.status === 'WAITING' && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {cancelling ? <Loader2 className="size-4 animate-spin" /> : null}
          {cancelling ? 'Cancelling…' : 'Cancel Token'}
        </button>
      )}

      {isEnded && (
        <Button onClick={() => navigate('/patient/tokens')} className="w-full">
          Back to tokens
        </Button>
      )}
    </div>
  );
}
