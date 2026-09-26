'use client'

import { motion } from 'framer-motion'
import { getByStatus, getLoad, getServing } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'
import { DeptIcon } from '../dept-icon'
import { LoadBadge } from '../status-badge'

const BAR: Record<string, string> = {
  normal: 'bg-emerald-500',
  busy: 'bg-amber-500',
  high: 'bg-red-500',
  closed: 'bg-muted-foreground/40',
}

export function DepartmentLoad() {
  const { state } = useQueue()

  return (
    <section aria-labelledby="dept-load-heading" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dept-load-heading" className="text-base font-semibold">
          Department Load Overview
        </h2>
        <div className="flex flex-wrap gap-2">
          <LoadBadge level="normal" />
          <LoadBadge level="busy" />
          <LoadBadge level="high" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {state.departments.map((dept) => {
          const waiting = getByStatus(state.tokens, dept.id, 'waiting').length
          const serving = getServing(state.tokens, dept.id)
          const level = dept.open ? getLoad(waiting, dept.avgMins) : 'closed'
          const loadPct = Math.min(100, ((waiting * dept.avgMins) / 60) * 100)

          return (
            <article key={dept.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
                    <DeptIcon deptId={dept.id} className="size-4.5" />
                  </span>
                  <div className="leading-tight">
                    <h3 className="text-sm font-semibold">{dept.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {dept.doctor} · {dept.room}
                    </p>
                  </div>
                </div>
                <LoadBadge level={level} />
              </div>

              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">In queue</dt>
                  <dd className="text-lg font-semibold tabular-nums">{waiting}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Speed</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {dept.avgMins}
                    <span className="text-xs font-medium text-muted-foreground"> min/pt</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Serving</dt>
                  <dd className="font-mono text-sm font-semibold leading-7">{serving?.id ?? '—'}</dd>
                </div>
              </dl>

              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <motion.div
                  className={cn('h-full rounded-full', BAR[level])}
                  initial={false}
                  animate={{ width: `${Math.max(loadPct, 4)}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
