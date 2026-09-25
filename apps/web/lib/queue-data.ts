export type Role = 'patient' | 'doctor' | 'admin'

export type TokenStatus = 'waiting' | 'called' | 'consulting' | 'completed' | 'skipped'

export type Token = {
  id: string
  deptId: string
  number: number
  name: string
  age: number
  type: 'Remote' | 'Walk-In'
  arrival: string
  status: TokenStatus
}

export type Department = {
  id: string
  name: string
  room: string
  doctor: string
  avgMins: number
  open: boolean
}

export type ActivityKind = 'called' | 'consulting' | 'completed' | 'skipped' | 'booked' | 'system'

export type Activity = {
  id: string
  time: string
  message: string
  kind: ActivityKind
}

export const TOTAL_ROOMS = 10

export const DEPARTMENTS: Department[] = [
  { id: 'CARD', name: 'Cardiology', room: 'OPD-102', doctor: 'Dr. A. Sharma', avgMins: 6, open: true },
  { id: 'ORTH', name: 'Orthopedics', room: 'OPD-104', doctor: 'Dr. R. Mehta', avgMins: 8, open: true },
  { id: 'PED', name: 'Pediatrics', room: 'OPD-106', doctor: 'Dr. S. Iyer', avgMins: 5, open: true },
  { id: 'GEN', name: 'General Medicine', room: 'OPD-101', doctor: 'Dr. K. Nair', avgMins: 4, open: true },
  { id: 'DERM', name: 'Dermatology', room: 'OPD-108', doctor: 'Dr. P. Rao', avgMins: 7, open: true },
  { id: 'ENT', name: 'ENT', room: 'OPD-110', doctor: 'Dr. M. Khan', avgMins: 6, open: true },
  { id: 'GYN', name: 'Gynecology', room: 'OPD-112', doctor: 'Dr. L. Gupta', avgMins: 9, open: true },
  { id: 'EYE', name: 'Ophthalmology', room: 'OPD-114', doctor: 'Dr. V. Menon', avgMins: 5, open: true },
]

export const PATIENT_NAMES = [
  'Ramesh Kumar', 'Sunita Devi', 'Mohammed Irfan', 'Priya Nair', 'Arjun Singh',
  'Kavita Joshi', 'Suresh Patil', 'Anjali Mishra', 'Vikram Rathore', 'Meena Kumari',
  'Harish Chandra', 'Fatima Begum', 'Deepak Yadav', 'Lakshmi Iyer', 'Rohit Sharma',
  'Pooja Reddy', 'Gopal Das', 'Neha Kapoor', 'Sanjay Verma', 'Asha Pillai',
]

type SeedSpec = {
  before: number
  skipped: number[]
  serving: 'called' | 'consulting' | null
  waiting: number
}

const SEED: Record<string, SeedSpec> = {
  CARD: { before: 10, skipped: [3, 7], serving: 'consulting', waiting: 2 },
  ORTH: { before: 6, skipped: [4], serving: 'called', waiting: 5 },
  PED: { before: 15, skipped: [6, 11], serving: 'consulting', waiting: 3 },
  GEN: { before: 22, skipped: [5, 14, 19], serving: 'consulting', waiting: 9 },
  DERM: { before: 5, skipped: [], serving: 'called', waiting: 1 },
  ENT: { before: 8, skipped: [2], serving: 'consulting', waiting: 4 },
  GYN: { before: 9, skipped: [3], serving: 'consulting', waiting: 7 },
  EYE: { before: 4, skipped: [], serving: null, waiting: 0 },
}

export function formatToken(deptId: string, number: number) {
  return `${deptId}-${String(number).padStart(3, '0')}`
}

function seedTime(index: number) {
  const minutes = 8 * 60 + 30 + index * 4
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hour12 = h > 12 ? h - 12 : h
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export function createInitialTokens(): Token[] {
  const tokens: Token[] = []
  let seed = 0
  for (const dept of DEPARTMENTS) {
    const spec = SEED[dept.id]
    const total = spec.before + (spec.serving ? 1 : 0) + spec.waiting
    for (let n = 1; n <= total; n++) {
      seed++
      let status: TokenStatus = 'waiting'
      if (n <= spec.before) status = spec.skipped.includes(n) ? 'skipped' : 'completed'
      else if (spec.serving && n === spec.before + 1) status = spec.serving
      tokens.push({
        id: formatToken(dept.id, n),
        deptId: dept.id,
        number: n,
        name: PATIENT_NAMES[(seed * 7) % PATIENT_NAMES.length],
        age: 18 + ((seed * 13) % 60),
        type: seed % 3 === 0 ? 'Walk-In' : 'Remote',
        arrival: seedTime(n * 2 + (seed % 3)),
        status,
      })
    }
  }
  return tokens
}

export const INITIAL_ACTIVITY: Activity[] = [
  { id: 'seed-1', time: '10:14 AM', message: 'Token CARD-011 started consultation in OPD-102', kind: 'consulting' },
  { id: 'seed-2', time: '10:12 AM', message: 'Token ORTH-007 called in OPD-104', kind: 'called' },
  { id: 'seed-3', time: '10:11 AM', message: 'Token ORTH-006 completed', kind: 'completed' },
  { id: 'seed-4', time: '10:09 AM', message: 'Token GEN-023 started consultation in OPD-101', kind: 'consulting' },
  { id: 'seed-5', time: '10:08 AM', message: 'Walk-in token GEN-032 issued at kiosk', kind: 'booked' },
  { id: 'seed-6', time: '10:06 AM', message: 'Token PED-011 marked no-show', kind: 'skipped' },
  { id: 'seed-7', time: '10:04 AM', message: 'Token DERM-006 called in OPD-108', kind: 'called' },
  { id: 'seed-8', time: '08:30 AM', message: 'OPD opened — 8 rooms active', kind: 'system' },
]

export function getServing(tokens: Token[], deptId: string) {
  return tokens.find((t) => t.deptId === deptId && (t.status === 'called' || t.status === 'consulting')) ?? null
}

export function getByStatus(tokens: Token[], deptId: string, status: TokenStatus) {
  return tokens.filter((t) => t.deptId === deptId && t.status === status).sort((a, b) => a.number - b.number)
}

export function getAhead(tokens: Token[], token: Token) {
  return tokens.filter(
    (t) =>
      t.deptId === token.deptId &&
      t.number < token.number &&
      (t.status === 'waiting' || t.status === 'called' || t.status === 'consulting'),
  ).length
}

export type LoadLevel = 'normal' | 'busy' | 'high'

export function getLoad(waiting: number, avgMins: number): LoadLevel {
  const delay = waiting * avgMins
  if (delay >= 40) return 'high'
  if (delay >= 20) return 'busy'
  return 'normal'
}

export function nowTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
