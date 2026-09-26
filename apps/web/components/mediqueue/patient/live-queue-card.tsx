'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CheckCircle2, Clock, DoorOpen, RotateCcw, Stethoscope, TriangleAlert, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAhead, getServing, type Token } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'
import { DeptIcon } from '../dept-icon'

export function LiveQueueCard({ token }: { token: Token }) {
  const { state, recall, clearPatientToken } = useQueue()
  const dept = state.departments.find((d) => d.id === token.deptId)
  if (!dept) return null

  const serving = getServing(state.tokens, dept.id)
  const ahead = getAhead(state.tokens, token)
  const waitMins = ahead * dept.avgMins
  const progress = token.status === 'waiting' ? Math.min(100, ((state.initialAhead - ahead) / state.initialAhead) * 100) : 100

  if (token.status === 'completed') {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border bg-card p-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-success">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Consultation completed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Token {token.id} · {dept.name}. Collect your prescription at the pharmacy counter.
          </p>
        </div>
        <Button size="lg" className="h-11 w-full text-base" onClick={clearPatientToken}>
          Book another token
        </Button>
      </section>
    )
  }

  return (
    <section aria-labelledby="live-queue-heading" className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      <AnimatePresence mode="wait">
        <StatusBanner key={`${token.status}-${ahead <= 3}`} status={token.status} ahead={ahead} room={dept.room} />
      </AnimatePresence>

      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between">
          <h2 id="live-queue-heading" className="flex items-center gap-2 text-sm font-semibold">
            <DeptIcon deptId={dept.id} className="size-4 text-primary" />
            {dept.name} · {dept.room}
          </h2>
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
            <p className="text-xs font-medium text-white/80">Your Token</p>
            <p className="mt-1 whitespace-nowrap font-mono text-2xl font-bold tracking-tight sm:text-3xl">{token.id}</p>
          </div>
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-xs font-medium text-muted-foreground">Now Serving</p>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={serving?.id ?? 'none'}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                className="mt-1 whitespace-nowrap font-mono text-2xl font-bold tracking-tight sm:text-3xl"
              >
                {serving?.id ?? '—'}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {token.status === 'waiting' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-end justify-between">
              <p className="text-base font-semibold" aria-live="polite">
                {ahead === 0 ? "You're next in line" : `${ahead} Patient${ahead === 1 ? '' : 's'} Ahead of You`}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                <Clock className="size-3.5" aria-hidden="true" />
                {'≈ '}
                {Math.max(waitMins, 1)} mins wait
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Queue progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-3 overflow-hidden rounded-full bg-muted"
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary to-teal"
                initial={false}
                animate={{ width: `${Math.max(progress, 6)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Joined at {token.arrival}</span>
              <span>~{dept.avgMins} min / patient</span>
            </div>
          </div>
        )}

        {token.status === 'skipped' && (
          <Button size="lg" variant="outline" className="h-11 text-base" onClick={() => recall(token.id)}>
            <RotateCcw aria-hidden="true" />
            Rejoin queue
          </Button>
        )}

        <dl className="grid grid-cols-3 gap-2 rounded-2xl border p-3 text-center text-xs">
          <div>
            <dt className="text-muted-foreground">Doctor</dt>
            <dd className="mt-0.5 font-semibold">{dept.doctor}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Room</dt>
            <dd className="mt-0.5 font-semibold">{dept.room}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="mt-0.5 font-semibold">{token.type}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function StatusBanner({ status, ahead, room }: { status: Token['status']; ahead: number; room: string }) {
  let content: { icon: typeof BellRing; title: string; body: string; className: string } | null = null

  if (status === 'called') {
    content = {
      icon: DoorOpen,
      title: "It's your turn!",
      body: `Please proceed to ${room} now.`,
      className: 'bg-success text-success-foreground',
    }
  } else if (status === 'consulting') {
    content = {
      icon: Stethoscope,
      title: 'Consultation in progress',
      body: `You are with the doctor in ${room}.`,
      className: 'bg-primary text-primary-foreground',
    }
  } else if (status === 'skipped') {
    content = {
      icon: UserX,
      title: 'You missed your turn',
      body: 'Your token was marked as no-show. Rejoin to get back in line.',
      className: 'bg-destructive text-white',
    }
  } else if (status === 'waiting' && ahead <= 3) {
    content = {
      icon: ahead === 0 ? BellRing : TriangleAlert,
      title: ahead === 0 ? "You're next!" : `Your Turn is Coming Up! (${ahead} turn${ahead === 1 ? '' : 's'} away)`,
      body: `Please stay near ${room}.`,
      className: 'bg-amber-50 text-amber-900 border-b border-amber-200',
    }
  }

  if (!content) return null
  const Icon = content.icon

  return (
    <motion.div
      role="status"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className={cn('overflow-hidden', content.className)}
    >
      <div className="flex items-start gap-3 px-5 py-3.5">
        <Icon className={cn('mt-0.5 size-5 shrink-0', status === 'waiting' && 'text-warning')} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{content.title}</p>
          <p className="text-xs opacity-85">{content.body}</p>
        </div>
      </div>
    </motion.div>
  )
}
