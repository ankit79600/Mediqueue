'use client'

import { DoorOpen } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { getByStatus } from '@/lib/queue-data'
import { cn } from '@/lib/utils'
import { useQueue } from '../queue-provider'
import { ActivePatientCard } from './active-patient-card'
import { QueueTable } from './queue-table'

const DEPT_ID = 'CARD'

export function DoctorPanel() {
  const { state, toggleOpen } = useQueue()
  const dept = state.departments.find((d) => d.id === DEPT_ID)
  if (!dept) return null

  const waiting = getByStatus(state.tokens, dept.id, 'waiting')
  const completed = getByStatus(state.tokens, dept.id, 'completed')

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-lg font-semibold text-primary">
            AS
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {dept.doctor} <span className="text-muted-foreground">- {dept.name}</span>
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <DoorOpen className="size-4" aria-hidden="true" />
              Room {dept.room} · Morning OPD 08:30 AM – 02:00 PM
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Stat label="Waiting" value={waiting.length} />
          <Stat label="Seen today" value={completed.length} />
          <Stat label="Avg / patient" value={`${dept.avgMins}m`} />
          <label
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors',
              dept.open ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
            )}
          >
            <span className="flex flex-col leading-tight">
              <span className={cn('text-sm font-semibold', dept.open ? 'text-emerald-800' : 'text-amber-800')}>
                {dept.open ? 'On-Duty' : 'Queue Paused'}
              </span>
              <span className="text-xs text-muted-foreground">{dept.open ? 'Accepting patients' : 'Calls disabled'}</span>
            </span>
            <Switch
              checked={dept.open}
              onCheckedChange={() => toggleOpen(dept.id)}
              aria-label="Toggle on-duty status"
              className="data-checked:bg-success data-unchecked:bg-warning"
            />
          </label>
        </div>
      </section>

      <ActivePatientCard dept={dept} />
      <QueueTable dept={dept} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted px-4 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
