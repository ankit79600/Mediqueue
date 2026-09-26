import type { LoadLevel, TokenStatus } from '@/lib/queue-data'
import { cn } from '@/lib/utils'

const STATUS: Record<TokenStatus, { label: string; className: string }> = {
  waiting: { label: 'Waiting', className: 'bg-secondary text-secondary-foreground' },
  called: { label: 'Called', className: 'bg-amber-100 text-amber-800' },
  consulting: { label: 'In Consultation', className: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  skipped: { label: 'No-Show', className: 'bg-red-100 text-red-700' },
}

const LOAD: Record<LoadLevel | 'closed', { label: string; className: string; dot: string }> = {
  normal: { label: 'Normal', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  busy: { label: 'Busy', className: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  high: { label: 'High Delay', className: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  closed: { label: 'Paused', className: 'bg-muted text-muted-foreground ring-border', dot: 'bg-muted-foreground' },
}

export function StatusBadge({ status, className }: { status: TokenStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', s.className, className)}>
      {s.label}
    </span>
  )
}

export function LoadBadge({ level }: { level: LoadLevel | 'closed' }) {
  const l = LOAD[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', l.className)}>
      <span className={cn('size-1.5 rounded-full', l.dot)} aria-hidden="true" />
      {l.label}
    </span>
  )
}
