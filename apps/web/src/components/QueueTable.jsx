import { PriorityBadge } from '@/components/PriorityBadge.jsx';

function minutesSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function QueueTable({ tokens }) {
  if (!tokens || tokens.length === 0) {
    return <p className="p-4 text-sm text-[#5b6b82]">No one is waiting.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[#e2e8f0] text-xs uppercase tracking-wide text-[#5b6b82]">
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
            <tr key={token.id} className="border-b border-[#e2e8f0]/60">
              <td className="py-2 pr-3 font-medium text-[#0f172a]">{token.position}</td>
              <td className="py-2 pr-3 text-[#0f172a]">{token.tokenNo}</td>
              <td className="py-2 pr-3 text-[#0f172a]">{token.patient?.name ?? '—'}</td>
              <td className="py-2 pr-3 text-[#5b6b82]">{token.patient?.age ?? '—'}</td>
              <td className="py-2 pr-3">
                <PriorityBadge priority={token.priority} />
              </td>
              <td className="py-2 pr-3 text-[#5b6b82]">{minutesSince(token.createdAt)} min</td>
              <td className="py-2 pr-3 text-[#5b6b82]">{token.estimatedWaitMin != null ? `${token.estimatedWaitMin} min` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
