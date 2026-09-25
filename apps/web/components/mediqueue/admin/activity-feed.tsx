'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Megaphone, Settings2, Stethoscope, Ticket, UserX } from 'lucide-react'
import type { ActivityKind } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'

const KIND: Record<ActivityKind, { icon: typeof Ticket; className: string }> = {
  called: { icon: Megaphone, className: 'bg-secondary text-primary' },
  consulting: { icon: Stethoscope, className: 'bg-teal/10 text-teal' },
  completed: { icon: CheckCircle2, className: 'bg-emerald-100 text-success' },
  skipped: { icon: UserX, className: 'bg-red-100 text-destructive' },
  booked: { icon: Ticket, className: 'bg-amber-100 text-warning' },
  system: { icon: Settings2, className: 'bg-muted text-muted-foreground' },
}

export function ActivityFeed() {
  const { state } = useQueue()

  return (
    <section aria-labelledby="feed-heading" className="flex flex-col rounded-2xl border bg-card lg:max-h-[calc(100dvh-14rem)]">
      <div className="flex items-center justify-between border-b p-5">
        <h2 id="feed-heading" className="text-base font-semibold">
          Real-Time Activity
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-medium text-success">
          <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
          Streaming
        </span>
      </div>
      <ol className="max-h-[520px] flex-1 overflow-y-auto p-3 lg:max-h-none" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {state.activity.map((a) => {
            const { icon: Icon, className } = KIND[a.kind]
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: -12, backgroundColor: 'rgba(2,132,199,0.08)' }}
                animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(2,132,199,0)' }}
                transition={{ duration: 0.4 }}
                className="flex items-start gap-3 rounded-xl px-2 py-2.5"
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', className)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{a.time}</p>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
    </section>
  )
}
