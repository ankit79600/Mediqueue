'use client'

import { QRCodeSVG } from 'qrcode.react'
import { ScanLine } from 'lucide-react'
import type { Token } from '@/lib/queue-data'
import { useQueue } from '../queue-provider'

export function QrCard({ token }: { token: Token }) {
  const { state } = useQueue()
  const dept = state.departments.find((d) => d.id === token.deptId)
  const payload = JSON.stringify({ token: token.id, room: dept?.room, phone: state.patient?.phone, issued: token.arrival })

  return (
    <section aria-labelledby="qr-heading" className="flex items-center gap-4 rounded-3xl border bg-card p-4">
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-white p-2.5">
        <QRCodeSVG value={payload} size={112} fgColor="#0f172a" level="M" title={`QR code for token ${token.id}`} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="qr-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanLine className="size-4 text-primary" aria-hidden="true" />
          Digital Token Pass
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Show this QR at the OPD scanner or reception desk for check-in verification.
        </p>
        <p className="font-mono text-sm font-semibold">
          {token.id} · {dept?.room}
        </p>
      </div>
    </section>
  )
}
