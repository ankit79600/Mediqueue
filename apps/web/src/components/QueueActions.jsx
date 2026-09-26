import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';

// MVP_CHECKLIST.md M4: Call Next / Skip / No-show / Complete, one action at a
// time, buttons disabled while an action is in flight. No-show requires an
// explicit confirm step (in-app, not window.confirm — keeps it accessible and
// testable) per TEAM_TASKS.md C4 "confirm on no-show".
export function QueueActions({ current, pending, onCallNext, onSkip, onNoShow, onComplete }) {
  const [noShowArmed, setNoShowArmed] = useState(false);
  const busy = pending !== null;

  if (!current) {
    return (
      <Button onClick={onCallNext} disabled={busy}>
        {pending === 'call-next' ? 'Calling next…' : 'Call next'}
      </Button>
    );
  }

  if (current.status !== 'CALLED') {
    return null;
  }

  const skipKey = `skip:${current.id}`;
  const noShowKey = `no-show:${current.id}`;
  const completeKey = `complete:${current.id}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onComplete} disabled={busy}>
        {pending === completeKey ? 'Completing…' : 'Complete'}
      </Button>
      <Button variant="outline" onClick={onSkip} disabled={busy}>
        {pending === skipKey ? 'Skipping…' : 'Skip'}
      </Button>
      {noShowArmed ? (
        <>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setNoShowArmed(false);
              onNoShow();
            }}
          >
            {pending === noShowKey ? 'Marking…' : 'Confirm no-show?'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setNoShowArmed(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => setNoShowArmed(true)}>
          No-show
        </Button>
      )}
    </div>
  );
}
