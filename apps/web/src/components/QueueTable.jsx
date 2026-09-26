import { PriorityBadge } from '@/components/PriorityBadge.jsx';

function minutesSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

// MVP_CHECKLIST.md M4: "ordered Waiting list with position + wait so far".
// Position/estimatedWaitMin come straight from the server (API_CONTRACT.md §2.5/§2.6) —
// "waiting since" here is a presentational read of the token's own createdAt, not a
// recomputation of queue order/ETA.
export function QueueTable({ tokens }) {
  if (!tokens || tokens.length === 0) {
    return <p className="p-4 text-sm text-slate-500">No one is waiting.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Token</th>
            <th className="py-2 pr-3">Patient</th>
            <th className="py-2 pr-3">Age</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3">Waiting since</th>
            <th className="py-2 pr-3">Est. wait</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.id} className="border-b border-slate-100">
              <td className="py-2 pr-3 font-medium text-slate-900">{token.position}</td>
              <td className="py-2 pr-3">{token.tokenNo}</td>
              <td className="py-2 pr-3">{token.patient?.name ?? '—'}</td>
              <td className="py-2 pr-3">{token.patient?.age ?? '—'}</td>
              <td className="py-2 pr-3">
                <PriorityBadge priority={token.priority} />
              </td>
              <td className="py-2 pr-3">{minutesSince(token.createdAt)} min</td>
              <td className="py-2 pr-3">{token.estimatedWaitMin != null ? `${token.estimatedWaitMin} min` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
