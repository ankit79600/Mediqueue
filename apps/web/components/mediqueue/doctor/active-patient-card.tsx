'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Megaphone, PauseCircle, Play, UserRound, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getByStatus, getServing, type Department } from '@/lib/queue-data'
import { useQueue } from '../queue-provider'
import { StatusBadge } from '../status-badge'

export function ActivePatientCard({ dept }: { dept: Department }) {
  const { state, callNext, startConsult, complete, skip } = useQueue()
  const current = getServing(state.tokens, dept.id)
  const upNext = getByStatus(state.tokens, dept.id, 'waiting').slice(0, 3)
  const todayCount = state.tokens.filter((t) => t.deptId === dept.id).length

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <section aria-labelledby="active-heading" className="rounded-2xl border bg-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 id="active-heading" className="text-sm font-semibold text-muted-foreground">
            Current Patient
          </h2>
          {!dept.open && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
              <PauseCircle className="size-4" aria-hidden="true" />
              Queue paused
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
              className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center"
            >
              <div className="flex flex-col items-center justify-center rounded-2xl bg-primary px-6 py-5 text-primary-foreground sm:min-w-48">
                <span className="text-xs font-medium text-white/80">Token</span>
                <span className="font-mono text-4xl font-bold tracking-tight">{current.id}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold tracking-tight">{current.name}</p>
                  <StatusBadge status={current.status} />
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Age</dt>
                    <dd className="font-medium">{current.age} yrs</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Position</dt>
                    <dd className="font-medium">
                      #{current.number} of {todayCount} today
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-medium">{current.type === 'Walk-In' ? 'Walk-In Kiosk' : 'Remote'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Arrived</dt>
                    <dd className="font-medium">{current.arrival}</dd>
                  </div>
                </dl>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed p-6"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <UserRound className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold">No patient called</p>
                <p className="text-sm text-muted-foreground">
                  {upNext.length > 0 ? `Call ${upNext[0].id} to begin.` : 'The queue is empty right now.'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Button
            size="lg"
            className="h-12 text-sm font-semibold"
            disabled={!dept.open || upNext.length === 0}
            onClick={() => callNext(dept.id)}
          >
            <Megaphone aria-hidden="true" />
            Call Next Patient
          </Button>
          <Button
            size="lg"
            className="h-12 bg-success text-sm font-semibold text-success-foreground hover:bg-success/85"
            disabled={current?.status !== 'called'}
            onClick={() => startConsult(dept.id)}
          >
            <Play aria-hidden="true" />
            Start Consultation
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 text-sm font-semibold"
            disabled={!current}
            onClick={() => complete(dept.id)}
          >
            <Check aria-hidden="true" />
            Mark Complete
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100 hover:text-amber-900"
            disabled={!current}
            onClick={() => skip(dept.id)}
          >
            <UserX aria-hidden="true" />
            Skip / No-Show
          </Button>
        </div>
      </section>

      <section aria-labelledby="upnext-heading" className="rounded-2xl border bg-card p-5">
        <h2 id="upnext-heading" className="text-sm font-semibold text-muted-foreground">
          Up Next
        </h2>
        <ol className="mt-3 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {upNext.map((t, i) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5"
              >
                <span className="flex size-7 items-center justify-center rounded-lg bg-card text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.type === 'Walk-In' ? 'Walk-In Kiosk' : 'Remote'}</p>
                </div>
                <span className="font-mono text-sm font-semibold">{t.id}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {upNext.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No one waiting.</li>}
        </ol>
      </section>
    </div>
  )
}
