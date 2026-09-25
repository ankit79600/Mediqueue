'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, Building2, CheckCircle2, Info, LogOut, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useQueue, type PatientNotification } from '../queue-provider'

const TONE_ICON: Record<PatientNotification['tone'], typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  success: CheckCircle2,
}

const TONE_CLASS: Record<PatientNotification['tone'], string> = {
  info: 'bg-secondary text-primary',
  warning: 'bg-amber-100 text-warning',
  success: 'bg-emerald-100 text-success',
}

export function PatientHeader({ onSignIn }: { onSignIn: () => void }) {
  const { state, readNotifications, logout } = useQueue()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = state.patient?.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const BellIcon = state.unread > 0 ? BellRing : Bell

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3.5 text-primary-foreground shadow-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Building2 className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">City General Hospital OPD</p>
          <p className="truncate text-xs text-white/75">
            {state.patient ? `Welcome, ${state.patient.name.split(' ')[0]}` : 'Outpatient Department'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div ref={panelRef} className="relative">
          <button
            type="button"
            aria-label={`Notifications${state.unread ? `, ${state.unread} unread` : ''}`}
            aria-expanded={open}
            onClick={() => {
              setOpen((o) => !o)
              readNotifications()
            }}
            className="relative flex size-9 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
          >
            <BellIcon className={cn('size-5', state.unread > 0 && 'animate-pulse')} aria-hidden="true" />
            {state.unread > 0 && (
              <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white ring-2 ring-primary">
                {state.unread}
              </span>
            )}
          </button>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-lg"
              >
                <p className="border-b px-4 py-3 text-sm font-semibold">Notifications</p>
                {state.notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {"You're all caught up."}
                  </p>
                ) : (
                  <ul className="max-h-72 divide-y overflow-y-auto">
                    {state.notifications.map((n) => {
                      const Icon = TONE_ICON[n.tone]
                      return (
                        <li key={n.id} className="flex gap-3 px-4 py-3">
                          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', TONE_CLASS[n.tone])}>
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm leading-snug">{n.message}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{n.time}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {state.patient ? (
          <div className="flex items-center gap-1.5">
            <span
              className="flex size-9 items-center justify-center rounded-xl bg-white text-sm font-semibold text-primary"
              title={`${state.patient.name} · +91 ${state.patient.phone}`}
            >
              {initials}
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="flex size-9 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button onClick={onSignIn} size="lg" className="bg-white text-primary hover:bg-white/90">
            Sign in
          </Button>
        )}
      </div>
    </div>
  )
}
