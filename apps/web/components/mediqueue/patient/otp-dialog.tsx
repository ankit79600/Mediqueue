'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2, ShieldCheck, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useQueue } from '../queue-provider'

type Step = 'phone' | 'otp'

export function OtpDialog({
  open,
  onOpenChange,
  onAuthenticated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthenticated: () => void
}) {
  const { login } = useQueue()
  const [step, setStep] = useState<Step>('phone')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const phoneValid = /^[6-9]\d{9}$/.test(phone)
  const nameValid = name.trim().length >= 2

  function reset() {
    setStep('phone')
    setOtp('')
    setLoading(false)
  }

  function sendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneValid || !nameValid) return
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      setStep('otp')
    }, 600)
  }

  function verify(code: string) {
    if (code.length !== 4) return
    setLoading(true)
    setTimeout(() => {
      login({ name: name.trim(), phone })
      reset()
      onAuthenticated()
    }, 700)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        {step === 'phone' ? (
          <form onSubmit={sendOtp} className="flex flex-col gap-5">
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Smartphone className="size-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg">Sign in with your phone</DialogTitle>
              <DialogDescription>{"We'll send a 4-digit code to verify your number."}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="patient-name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="patient-name"
                autoComplete="name"
                placeholder="e.g. Rahul Verma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 text-base"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="patient-phone" className="text-sm font-medium">
                Mobile number
              </label>
              <div className="flex h-11 items-center overflow-hidden rounded-lg border border-input focus-within:ring-3 focus-within:ring-ring/50">
                <span className="flex h-full items-center border-r bg-muted px-3 text-sm font-medium text-muted-foreground">
                  +91
                </span>
                <input
                  id="patient-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="h-full flex-1 bg-transparent px-3 text-base tracking-wide outline-none"
                  aria-invalid={phone.length === 10 && !phoneValid}
                />
              </div>
            </div>

            <Button type="submit" size="lg" className="h-11 text-base" disabled={!phoneValid || !nameValid || loading}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              Send OTP
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <div className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-success">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <DialogTitle className="text-lg">Enter verification code</DialogTitle>
              <DialogDescription>
                Code sent to <span className="font-medium text-foreground">+91 {phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="flex justify-center">
              <InputOTP
                maxLength={4}
                value={otp}
                onChange={(v) => {
                  setOtp(v)
                  if (v.length === 4) verify(v)
                }}
                disabled={loading}
                autoFocus
                aria-label="4-digit verification code"
              >
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot key={i} index={i} className="size-14 rounded-xl border text-xl font-semibold" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <p className="text-center text-xs text-muted-foreground">Demo mode: enter any 4 digits to continue.</p>

            <Button size="lg" className="h-11 text-base" disabled={otp.length !== 4 || loading} onClick={() => verify(otp)}>
              {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
              Verify & Continue
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Change number
              </button>
              <button type="button" onClick={() => setOtp('')} className="font-medium text-primary hover:underline">
                Resend code
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
