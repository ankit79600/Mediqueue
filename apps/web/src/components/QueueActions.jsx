import { Button } from '@/components/ui/button.jsx';

// MVP_CHECKLIST.md M4: Call Next / Skip / No-show / Complete, one action at a
// time, buttons disabled while an action is in flight. No-show requires an
// explicit confirm step (in-app, not window.confirm — keeps it accessible and
// testable) per TEAM_TASKS.md C4 "confirm on no-show".
// noShowArmed/onArmNoShow are controlled by the parent (not local state) so the
// keyboard shortcut (X) can arm/confirm through the exact same state as a click.
export function QueueActions({
  current,
  pending,
  noShowArmed,
  onCallNext,
  onSkip,
  onArmNoShow,
  onCancelNoShow,
  onConfirmNoShow,
  onComplete,
}) {
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
          <Button variant="destructive" disabled={busy} onClick={onConfirmNoShow}>
            {pending === noShowKey ? 'Marking…' : 'Confirm no-show?'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancelNoShow}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="outline" disabled={busy} onClick={onArmNoShow}>
          No-show
        </Button>
      )}
    </div>
  );
}
