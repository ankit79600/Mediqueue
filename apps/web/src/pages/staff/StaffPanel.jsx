import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDoctorQueue } from '@/hooks/useDoctorQueue.js';
import { TokenCard } from '@/components/TokenCard.jsx';
import { QueueTable } from '@/components/QueueTable.jsx';
import { StatCard } from '@/components/StatCard.jsx';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { QueueActions } from '@/components/QueueActions.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ApiError, onUnauthorized } from '@/lib/api.js';

// API_CONTRACT.md §3 — every code this page can actually receive from E16-E20.
// Falls back to the server-provided `message` (still contract data, never a
// raw stack trace) for anything not explicitly mapped below.
function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR') return 'That request was invalid. Please try again.';
    if (err.code === 'UNAUTHENTICATED') return 'Your session expired. Redirecting to sign in…';
    if (err.code === 'FORBIDDEN') return "You don't have access to this doctor's queue.";
    if (err.code === 'DOCTOR_NOT_FOUND') return 'This doctor could not be found.';
    if (err.code === 'TOKEN_NOT_FOUND') return 'This token could not be found.';
    if (err.code === 'CONSULT_IN_PROGRESS') return 'A patient is already in consultation. Complete or skip them first.';
    if (err.code === 'QUEUE_EMPTY') return 'No patients are waiting.';
    if (err.code === 'INVALID_STATE') return "That action can't be completed — the queue state changed. Refreshed with the latest.";
    return err.message;
  }
  if (err?.code) return err.message ?? 'Could not load the queue.'; // SocketAckError
  return 'Could not load the queue. Check your connection and try again.';
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export default function StaffPanel() {
  const { doctorId } = useParams();
  // Remount per doctorId instead of resetting hook state internally.
  return <DoctorQueuePanel key={doctorId} doctorId={doctorId} />;
}

function DoctorQueuePanel({ doctorId }) {
  const navigate = useNavigate();
  const {
    snapshot,
    status,
    error,
    connection,
    refetch,
    actionPending,
    actionError,
    clearActionError,
    callNext,
    skip,
    noShow,
    complete,
  } = useDoctorQueue(doctorId);
  const [skipResult, setSkipResult] = useState(null); // { tokenNo, result } | null
  const [noShowArmed, setNoShowArmed] = useState(false);

  // lib/api.js clears the token on any 401; this sends the user back to login
  // instead of leaving them stranded on a now-unauthenticated page.
  useEffect(() => onUnauthorized(() => navigate('/staff/login', { replace: true })), [navigate]);

  const current = snapshot?.current ?? null;

  const handleCallNext = useCallback(async () => {
    setSkipResult(null);
    setNoShowArmed(false);
    try {
      await callNext();
    } catch {
      // surfaced via actionError banner
    }
  }, [callNext]);

  const handleSkip = useCallback(async () => {
    if (!current) return;
    setSkipResult(null);
    setNoShowArmed(false);
    try {
      const res = await skip(current.id);
      setSkipResult({ tokenNo: res.token.tokenNo, result: res.result });
    } catch {
      // surfaced via actionError banner
    }
  }, [current, skip]);

  const handleConfirmNoShow = useCallback(async () => {
    if (!current) return;
    setSkipResult(null);
    setNoShowArmed(false);
    try {
      await noShow(current.id);
    } catch {
      // surfaced via actionError banner
    }
  }, [current, noShow]);

  const handleComplete = useCallback(async () => {
    if (!current) return;
    setSkipResult(null);
    setNoShowArmed(false);
    try {
      await complete(current.id);
    } catch {
      // surfaced via actionError banner
    }
  }, [current, complete]);

  // TEAM_TASKS.md C4: N = next, C = complete, S = skip, X = no-show (armed,
  // press again to confirm — same as clicking "No-show" then "Confirm no-show?").
  // Keyboard actions call the exact same handlers as the buttons and respect
  // the same guards (nothing fires while an action is pending, while typing in
  // a field, or when the relevant button wouldn't be shown/enabled anyway).
  useEffect(() => {
    function onKeyDown(e) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;
      if (actionPending) return;

      const key = e.key.toLowerCase();
      if (key === 'n') {
        if (current) return; // Call Next isn't valid/shown while someone is CALLED
        e.preventDefault();
        handleCallNext();
      } else if (key === 'c') {
        if (!current || current.status !== 'CALLED') return;
        e.preventDefault();
        handleComplete();
      } else if (key === 's') {
        if (!current || current.status !== 'CALLED') return;
        e.preventDefault();
        handleSkip();
      } else if (key === 'x') {
        if (!current || current.status !== 'CALLED') return;
        e.preventDefault();
        if (noShowArmed) {
          handleConfirmNoShow();
        } else {
          setNoShowArmed(true);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actionPending, current, noShowArmed, handleCallNext, handleComplete, handleSkip, handleConfirmNoShow]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn't load the queue</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-red-600">{errorMessage(error)}</p>
          <Button className="w-fit" onClick={refetch}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { doctor, department, waiting, stats } = snapshot;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{doctor.name}</h1>
          <p className="text-sm text-slate-500">
            {department.name} · {doctor.room}
          </p>
        </div>
        <ConnectionPill state={connection} />
      </div>

      {actionError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center justify-between gap-3 pt-4">
            <p className="text-sm text-red-700">{errorMessage(actionError)}</p>
            <Button variant="ghost" onClick={clearActionError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {skipResult && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center justify-between gap-3 pt-4">
            <p className="text-sm text-amber-800">
              {skipResult.result === 'NO_SHOW'
                ? `${skipResult.tokenNo} was skipped twice and marked as a no-show.`
                : `${skipResult.tokenNo} was skipped and requeued.`}
            </p>
            <Button variant="ghost" onClick={() => setSkipResult(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-1">
          <TokenCard token={current} />
          <QueueActions
            current={current}
            pending={actionPending}
            noShowArmed={noShowArmed}
            onCallNext={handleCallNext}
            onSkip={handleSkip}
            onArmNoShow={() => setNoShowArmed(true)}
            onCancelNoShow={() => setNoShowArmed(false)}
            onConfirmNoShow={handleConfirmNoShow}
            onComplete={handleComplete}
          />
          <p className="text-xs text-slate-400">Shortcuts: N next · C complete · S skip · X no-show</p>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
          <StatCard label="Served today" value={stats.servedToday} />
          <StatCard label="No-shows" value={stats.noShowToday} />
          <StatCard label="Waiting" value={stats.waitingCount} />
          <StatCard label="Avg consult" value={`${stats.avgConsultMin} min`} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waiting queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <QueueTable tokens={waiting} />
        </CardContent>
      </Card>
    </div>
  );
}
