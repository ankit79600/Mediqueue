'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe, Megaphone, MonitorSmartphone, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getByStatus, type Department, type TokenStatus } from '@/lib/queue-data'
import { useQueue } from '../queue-provider'
import { StatusBadge } from '../status-badge'

type Filter = Extract<TokenStatus, 'waiting' | 'skipped' | 'completed'>

export function QueueTable({ dept }: { dept: Department }) {
  const { state, callToken, recall } = useQueue()
  const [filter, setFilter] = useState<Filter>('waiting')

  const lists: Record<Filter, ReturnType<typeof getByStatus>> = {
    waiting: getByStatus(state.tokens, dept.id, 'waiting'),
    skipped: getByStatus(state.tokens, dept.id, 'skipped'),
    completed: getByStatus(state.tokens, dept.id, 'completed').reverse(),
  }
  const rows = lists[filter]

  return (
    <section aria-labelledby="queue-heading" className="rounded-2xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="queue-heading" className="text-base font-semibold">
          OPD Queue
        </h2>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-9">
            <TabsTrigger value="waiting" className="px-3">
              Waiting ({lists.waiting.length})
            </TabsTrigger>
            <TabsTrigger value="skipped" className="px-3">
              Skipped ({lists.skipped.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="px-3">
              Completed ({lists.completed.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-5 py-3 font-medium">Token #</th>
              <th scope="col" className="px-5 py-3 font-medium">Patient Name</th>
              <th scope="col" className="px-5 py-3 font-medium">Type</th>
              <th scope="col" className="px-5 py-3 font-medium">Arrival Time</th>
              <th scope="col" className="px-5 py-3 font-medium">Status</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((t) => (
                <motion.tr
                  key={t.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-b last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3 font-mono font-semibold">{t.id}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.age} yrs</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      {t.type === 'Remote' ? (
                        <Globe className="size-4 text-primary" aria-hidden="true" />
                      ) : (
                        <MonitorSmartphone className="size-4 text-teal" aria-hidden="true" />
                      )}
                      {t.type === 'Remote' ? 'Remote' : 'Walk-In Kiosk'}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{t.arrival}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {t.status === 'waiting' && (
                      <Button size="sm" variant="outline" disabled={!dept.open} onClick={() => callToken(t.id)}>
                        <Megaphone aria-hidden="true" />
                        Call now
                      </Button>
                    )}
                    {t.status === 'skipped' && (
                      <Button size="sm" variant="outline" onClick={() => recall(t.id)}>
                        <RotateCcw aria-hidden="true" />
                        Recall
                      </Button>
                    )}
                    {t.status === 'completed' && <span className="text-xs text-muted-foreground">Seen</span>}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No patients in this list.</p>
        )}
      </div>
    </section>
  )
}
