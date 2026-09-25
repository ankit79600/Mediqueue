'use client'

import { motion } from 'framer-motion'
import { Activity, LayoutDashboard, Stethoscope, UserRound } from 'lucide-react'
import type { Role } from '@/lib/queue-data'
import { cn } from '@/lib/utils'

const ROLES: { id: Role; label: string; short: string; icon: typeof UserRound }[] = [
  { id: 'patient', label: 'Patient', short: 'Patient', icon: UserRound },
  { id: 'doctor', label: 'Doctor OPD Panel', short: 'Doctor', icon: Stethoscope },
  { id: 'admin', label: 'Hospital Admin', short: 'Admin', icon: LayoutDashboard },
]

export function AppHeader({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight">MediQueue</p>
              <p className="text-xs text-muted-foreground">Smart OPD Queue System</p>
            </div>
          </div>
          <LiveIndicator className="sm:hidden" />
        </div>

        <div
          role="tablist"
          aria-label="Switch workspace role"
          className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 sm:flex"
        >
          {ROLES.map(({ id, label, short, icon: Icon }) => {
            const active = role === id
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`panel-${id}`}
                onClick={() => onRoleChange(id)}
                className={cn(
                  'relative flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="role-pill"
                    className="absolute inset-0 rounded-lg bg-card shadow-sm"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative size-4" aria-hidden="true" />
                <span className="relative hidden md:inline">{label}</span>
                <span className="relative md:hidden">{short}</span>
              </button>
            )
          })}
        </div>

        <LiveIndicator className="hidden sm:flex" />
      </div>
    </header>
  )
}

function LiveIndicator({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium', className)}>
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      Live OPD
    </div>
  )
}
