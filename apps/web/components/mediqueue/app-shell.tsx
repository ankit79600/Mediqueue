'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Role } from '@/lib/queue-data'
import { QueueProvider } from './queue-provider'
import { AppHeader } from './app-header'
import { PatientPortal } from './patient/patient-portal'
import { DoctorPanel } from './doctor/doctor-panel'
import { AdminDashboard } from './admin/admin-dashboard'

const VIEWS: Record<Role, () => React.ReactElement | null> = {
  patient: PatientPortal,
  doctor: DoctorPanel,
  admin: AdminDashboard,
}

export function AppShell() {
  const [role, setRole] = useState<Role>('patient')
  const View = VIEWS[role]

  return (
    <QueueProvider>
      <div className="min-h-dvh">
        <AppHeader role={role} onRoleChange={setRole} />
        <main id={`panel-${role}`} role="tabpanel" aria-labelledby={`tab-${role}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <View />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </QueueProvider>
  )
}
