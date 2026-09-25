'use client'
import SoftAurora from '../../SoftAurora';
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueue } from '../queue-provider'
import { PatientHeader } from './patient-header'
import { OtpDialog } from './otp-dialog'
import { BookToken } from './book-token'
import { LiveQueueCard } from './live-queue-card'
import { QrCard } from './qr-card'

export function PatientPortal() {
  const { state, book } = useQueue()
  const [authOpen, setAuthOpen] = useState(false)
  const [pendingDept, setPendingDept] = useState<string | null>(null)

  const token = state.tokens.find((t) => t.id === state.patientTokenId) ?? null

  function handleBook(deptId: string) {
    if (!state.patient) {
      setPendingDept(deptId)
      setAuthOpen(true)
      return
    }
    book(deptId)
  }

  function handleAuthenticated() {
    setAuthOpen(false)
    if (pendingDept) {
      book(pendingDept)
      setPendingDept(null)
    }
  }

  return (
  <div className="relative min-h-screen overflow-hidden">
    {/* Soft Aurora background */}
    <div className="pointer-events-none absolute inset-0 z-0">
      <SoftAurora
        speed={0.25}
        brightness={0.7}
        scale={1.5}
        color1="#dbeafe"
        color2="#60a5fa"
        enableMouseInteraction={true}
        mouseInfluence={0.4}
      />
    </div>

    {/* Existing MediQueue UI */}
    <div className="relative z-10 mx-auto w-full max-w-md px-4 pt-4 pb-12">
      <PatientHeader onSignIn={() => setAuthOpen(true)} />

      <AnimatePresence mode="wait">
        {token ? (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25 }}
            className="mt-5 flex flex-col gap-4"
          >
            <LiveQueueCard token={token} />
            {token.status !== 'completed' && <QrCard token={token} />}
          </motion.div>
        ) : (
          <motion.div
            key="book"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-5"
          >
            <BookToken onBook={handleBook} />
          </motion.div>
        )}
      </AnimatePresence>

      <OtpDialog
        open={authOpen}
        onOpenChange={(open) => {
          setAuthOpen(open)
          if (!open) setPendingDept(null)
        }}
        onAuthenticated={handleAuthenticated}
      />
    </div>
  </div>
)
}