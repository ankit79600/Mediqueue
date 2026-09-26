import { cn } from '@/lib/utils.js';

// Presentational only — SOCKET_CONTRACT.md §6: "Live" / "Polling" / "Offline".
// Pages wire `state` from lib/socket.js's getConnectionState()/onConnectionChange()
// (or the >5s-disconnected polling rule once a feature hook implements it).
const LABEL = { live: 'Live', polling: 'Polling', offline: 'Offline', connecting: 'Connecting' };
const DOT_CLASS = {
  live: 'bg-emerald-500',
  polling: 'bg-amber-500',
  offline: 'bg-red-500',
  connecting: 'bg-slate-400',
};

export function ConnectionPill({ state = 'connecting', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[state])} />
      {LABEL[state] ?? state}
    </span>
  );
}
