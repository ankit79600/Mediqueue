import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Label } from '@/components/ui/label.jsx';

// API_CONTRACT.md E23-E25. TEAM_TASKS.md C7: "Admin simulator toggle + demo
// reset button." Demo/ops convenience, not part of MVP_CHECKLIST.md M1-M6 —
// rendered here as its own card so it reads clearly as a secondary control,
// not a core KPI.
export function SimulatorControls({ simulator, pending, onStart, onStop, onReset }) {
  const [speed, setSpeed] = useState(10);
  const running = simulator?.running ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simulator &amp; demo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          {running
            ? `Running at ${simulator.speed}x · ${simulator.tokensCreated} tokens created · ${simulator.actionsPerformed} actions performed`
            : 'Simulator stopped.'}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-speed">Speed</Label>
            <Input
              id="sim-speed"
              type="number"
              min={1}
              max={60}
              className="w-20"
              value={speed}
              disabled={running || pending !== null}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </div>
          {running ? (
            <Button variant="outline" disabled={pending !== null} onClick={onStop}>
              {pending === 'stop' ? 'Stopping…' : 'Stop simulator'}
            </Button>
          ) : (
            <Button disabled={pending !== null} onClick={() => onStart(speed)}>
              {pending === 'start' ? 'Starting…' : 'Start simulator'}
            </Button>
          )}
          <Button variant="destructive" disabled={pending !== null} onClick={onReset}>
            {pending === 'reset' ? 'Resetting…' : 'Reset demo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
