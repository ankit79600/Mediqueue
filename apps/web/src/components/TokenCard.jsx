import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';
import { PriorityBadge } from '@/components/PriorityBadge.jsx';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// MVP_CHECKLIST.md M4: "Current patient card (token no, name, age, priority, called time)".
export function TokenCard({ token }) {
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current patient</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">No patient in consultation. Call next to begin.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Current patient</CardTitle>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={token.priority} />
          <StatusBadge status={token.status} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Token</p>
          <p className="font-semibold text-slate-900">{token.tokenNo}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Called at</p>
          <p className="font-semibold text-slate-900">{formatTime(token.calledAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Patient</p>
          <p className="font-semibold text-slate-900">{token.patient?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Age</p>
          <p className="font-semibold text-slate-900">{token.patient?.age ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
