import { UserRound, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { StatusBadge } from '@/components/StatusBadge.jsx';
import { PriorityBadge } from '@/components/PriorityBadge.jsx';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TokenCard({ token }) {
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current patient</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#5b6b82]">No patient in consultation. Call next to begin.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#0284c7]/20 bg-[#e0f2fe]/10">
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#e0f2fe]">
            <UserRound className="size-4 text-[#0284c7]" aria-hidden="true" />
          </div>
          <CardTitle>Current patient</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={token.priority} />
          <StatusBadge status={token.status} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#5b6b82]">Token</p>
          <p className="text-2xl font-bold text-[#0f172a]">{token.tokenNo}</p>
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-xs text-[#5b6b82]">Called at</p>
          <div className="flex items-center gap-1">
            <Clock className="size-3 text-[#0284c7]" aria-hidden="true" />
            <p className="font-semibold text-[#0f172a]">{formatTime(token.calledAt)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-[#5b6b82]">Patient</p>
          <p className="font-semibold text-[#0f172a]">{token.patient?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#5b6b82]">Age</p>
          <p className="font-semibold text-[#0f172a]">{token.patient?.age ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
