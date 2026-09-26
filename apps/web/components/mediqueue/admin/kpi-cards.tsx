'use client'

import { DoorOpen, Timer, TrendingDown, TrendingUp, Ticket, UserX } from 'lucide-react'
import { TOTAL_ROOMS, getByStatus, getServing } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'

export function KpiCards() {
  const { state } = useQueue()
  const { tokens, departments } = state

  const totalTokens = tokens.length
  const completed = tokens.filter((t) => t.status === 'completed').length
  const skipped = tokens.filter((t) => t.status === 'skipped').length
  const noShowRate = completed + skipped === 0 ? 0 : (skipped / (completed + skipped)) * 100
  const openRooms = departments.filter((d) => d.open).length

  const waitSamples = departments
    .filter((d) => d.open)
    .map((d) => {
      const queue = getByStatus(tokens, d.id, 'waiting').length + (getServing(tokens, d.id) ? 1 : 0)
      return (queue * d.avgMins) / 2
    })
  const avgWait = waitSamples.length ? waitSamples.reduce((a, b) => a + b, 0) / waitSamples.length : 0

  const cards = [
    {
      label: 'Total Tokens Today',
      value: totalTokens.toString(),
      icon: Ticket,
      trend: { up: true, text: '+12% vs yesterday', good: true },
    },
    {
      label: 'Average Wait Time',
      value: `${avgWait.toFixed(1)} mins`,
      icon: Timer,
      trend: { up: false, text: '-2.1 mins vs last week', good: true },
    },
    {
      label: 'Active OPD Rooms',
      value: `${openRooms} / ${TOTAL_ROOMS}`,
      suffix: 'Rooms Open',
      icon: DoorOpen,
    },
    {
      label: 'Patient No-Show Rate',
      value: `${noShowRate.toFixed(1)}%`,
      icon: UserX,
      badge: noShowRate > 15 ? { text: 'Above target', className: 'bg-red-50 text-red-700' } : { text: 'Within target', className: 'bg-emerald-50 text-emerald-700' },
    },
  ]

  return (
    <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, trend, suffix, badge }) => (
        <div key={label} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
          </div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
            {suffix && <span className="ml-1.5 text-sm font-medium text-muted-foreground">{suffix}</span>}
          </p>
          {trend && (
            <p className={cn('flex items-center gap-1 text-xs font-medium', trend.good ? 'text-success' : 'text-destructive')}>
              {trend.up ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
              {trend.text}
            </p>
          )}
          {badge && (
            <span className={cn('w-fit rounded-full px-2.5 py-0.5 text-xs font-medium', badge.className)}>{badge.text}</span>
          )}
          {suffix && (
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: TOTAL_ROOMS }).map((_, i) => (
                <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < openRooms ? 'bg-primary' : 'bg-muted')} />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
