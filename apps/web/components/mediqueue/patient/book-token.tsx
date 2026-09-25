'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Ticket, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getByStatus, getServing } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'
import { DeptIcon } from '../dept-icon'

export function BookToken({ onBook }: { onBook: (deptId: string) => void }) {
  const { state } = useQueue()
  const [selected, setSelected] = useState('CARD')
  const selectedDept = state.departments.find((d) => d.id === selected)

  return (
    <section aria-labelledby="book-heading" className="flex flex-col gap-4">
      <div>
        <h1 id="book-heading" className="text-2xl font-semibold tracking-tight text-balance">
          Skip the line. Get your OPD token.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Choose a department and join the live queue from your phone.
        </p>
      </div>

      <div role="radiogroup" aria-label="Select department" className="grid grid-cols-2 gap-3">
        {state.departments.map((dept) => {
          const waiting = getByStatus(state.tokens, dept.id, 'waiting').length + (getServing(state.tokens, dept.id) ? 1 : 0)
          const active = selected === dept.id
          return (
            <motion.button
  key={dept.id}
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty(
      '--mouse-x',
      `${e.clientX - rect.left}px`
    )
    e.currentTarget.style.setProperty(
      '--mouse-y',
      `${e.clientY - rect.top}px`
    )
  }}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!dept.open}
              onClick={() => setSelected(dept.id)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                    'group relative overflow-hidden flex flex-col items-start gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50',
              )}
            >
              <span
  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
  style={{
    background:
      'radial-gradient(180px circle at var(--mouse-x) var(--mouse-y), rgba(96, 165, 250, 0.18), transparent 70%)',
  }}
/>
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl',
                  active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary',
                )}
              >
                <DeptIcon deptId={dept.id} className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">{dept.name}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" aria-hidden="true" />
                  {dept.open ? (
  <span className="inline-flex items-center">
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={waiting}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 }}
        className="inline-block"
      >
        {waiting}
      </motion.span>
    </AnimatePresence>
    <span className="ml-1">in queue</span>
  </span>
) : (
  'Closed'
)}
                </span>
              </span>
            </motion.button>
          )
        })}
      </div>

      {selectedDept && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold">{selectedDept.name}</p>
              <p className="text-muted-foreground">
                {selectedDept.doctor} · {selectedDept.room}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              <Clock className="size-3.5" aria-hidden="true" />
              {'≈ '}
              {(getByStatus(state.tokens, selectedDept.id, 'waiting').length +
                (getServing(state.tokens, selectedDept.id) ? 1 : 0)) *
                selectedDept.avgMins}{' '}
              min
            </span>
          </div>
          <Button size="lg" className="h-12 text-base" onClick={() => onBook(selectedDept.id)}>
            <Ticket className="size-5" aria-hidden="true" />
            Get Instant Token
          </Button>
          {!state.patient && (
            <p className="text-center text-xs text-muted-foreground">{"You'll verify your phone number with a quick OTP."}</p>
          )}
        </div>
      )}
    </section>
  )
}
