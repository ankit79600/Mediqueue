import { Baby, Bone, Ear, Eye, HeartHandshake, HeartPulse, Sparkles, Stethoscope, type LucideProps } from 'lucide-react'

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  CARD: HeartPulse,
  ORTH: Bone,
  PED: Baby,
  GEN: Stethoscope,
  DERM: Sparkles,
  ENT: Ear,
  GYN: HeartHandshake,
  EYE: Eye,
}

export function DeptIcon({ deptId, ...props }: { deptId: string } & LucideProps) {
  const Icon = ICONS[deptId] ?? Stethoscope
  return <Icon aria-hidden="true" {...props} />
}
