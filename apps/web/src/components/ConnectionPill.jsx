import { cn } from '@/lib/utils.js';

const LABEL = {
  live: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  polling: 'Polling',
  offline: 'Offline',
};

const DOT_CLASS = {
  live: 'bg-emerald-500',
  connecting: 'bg-slate-400 animate-pulse',
  reconnecting: 'bg-amber-400 animate-pulse',
  polling: 'bg-amber-500',
  offline: 'bg-red-500',
};

export function ConnectionPill({ state = 'connecting', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-medium text-[#5b6b82]',
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[state] ?? 'bg-slate-400')} />
      {LABEL[state] ?? state}
    </span>
  );
}
