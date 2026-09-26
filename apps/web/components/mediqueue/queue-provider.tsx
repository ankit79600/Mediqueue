'use client'

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import {
  DEPARTMENTS,
  INITIAL_ACTIVITY,
  PATIENT_NAMES,
  createInitialTokens,
  formatToken,
  getAhead,
  getByStatus,
  getServing,
  nowTime,
  type Activity,
  type ActivityKind,
  type Department,
  type Token,
  type TokenStatus,
} from '@/lib/queue-data'

export type Patient = { name: string; phone: string }

export type PatientNotification = {
  id: string
  time: string
  message: string
  tone: 'info' | 'warning' | 'success'
}

type State = {
  departments: Department[]
  tokens: Token[]
  activity: Activity[]
  patient: Patient | null
  patientTokenId: string | null
  initialAhead: number
  notifications: PatientNotification[]
  unread: number
  warnedTokenId: string | null
  seq: number
}

type Action =
  | { type: 'LOGIN'; patient: Patient }
  | { type: 'LOGOUT' }
  | { type: 'BOOK'; deptId: string; time: string }
  | { type: 'CLEAR_PATIENT_TOKEN' }
  | { type: 'CALL_NEXT'; deptId: string; time: string }
  | { type: 'START_CONSULT'; deptId: string; time: string }
  | { type: 'COMPLETE'; deptId: string; time: string }
  | { type: 'SKIP'; deptId: string; time: string }
  | { type: 'CALL_TOKEN'; tokenId: string; time: string }
  | { type: 'RECALL'; tokenId: string; time: string }
  | { type: 'TOGGLE_OPEN'; deptId: string; time: string }
  | { type: 'WALK_IN'; deptId: string; name: string; age: number; time: string }
  | { type: 'SIMULATE'; deptId: string; time: string }
  | { type: 'READ_NOTIFICATIONS' }

type Entry = { message: string; kind: ActivityKind }

function setStatus(tokens: Token[], id: string, status: TokenStatus) {
  return tokens.map((t) => (t.id === id ? { ...t, status } : t))
}

function commit(state: State, tokens: Token[], entries: Entry[], time: string, extra: Partial<State> = {}): State {
  let seq = state.seq
  const newActivity = entries.map((e) => ({ id: `a-${++seq}`, time, ...e })).reverse()
  return {
    ...state,
    ...extra,
    tokens,
    activity: [...newActivity, ...state.activity].slice(0, 80),
    seq,
  }
}

function advance(tokens: Token[], dept: Department): { tokens: Token[]; entries: Entry[] } {
  const entries: Entry[] = []
  let next = tokens
  const current = getServing(next, dept.id)
  if (current) {
    next = setStatus(next, current.id, 'completed')
    entries.push({ message: `Token ${current.id} completed in ${dept.room}`, kind: 'completed' })
  }
  const upcoming = getByStatus(next, dept.id, 'waiting')[0]
  if (upcoming) {
    next = setStatus(next, upcoming.id, 'called')
    entries.push({ message: `Token ${upcoming.id} called in ${dept.room}`, kind: 'called' })
  }
  return { tokens: next, entries }
}

function nextNumber(tokens: Token[], deptId: string) {
  return tokens.reduce((max, t) => (t.deptId === deptId ? Math.max(max, t.number) : max), 0) + 1
}

function baseReducer(state: State, action: Action): State {
  const findDept = (id: string) => state.departments.find((d) => d.id === id)

  switch (action.type) {
    case 'LOGIN':
      return { ...state, patient: action.patient }
    case 'LOGOUT':
      return { ...state, patient: null, patientTokenId: null, notifications: [], unread: 0 }
    case 'READ_NOTIFICATIONS':
      return { ...state, unread: 0 }
    case 'CLEAR_PATIENT_TOKEN':
      return { ...state, patientTokenId: null, warnedTokenId: null }
    case 'BOOK': {
      const dept = findDept(action.deptId)
      if (!dept || !state.patient) return state
      const number = nextNumber(state.tokens, dept.id)
      const token: Token = {
        id: formatToken(dept.id, number),
        deptId: dept.id,
        number,
        name: state.patient.name,
        age: 34,
        type: 'Remote',
        arrival: action.time,
        status: 'waiting',
      }
      const tokens = [...state.tokens, token]
      const ahead = getAhead(tokens, token)
      return commit(
        state,
        tokens,
        [{ message: `Remote token ${token.id} booked for ${dept.name}`, kind: 'booked' }],
        action.time,
        {
          patientTokenId: token.id,
          initialAhead: Math.max(ahead, 1),
          warnedTokenId: null,
          notifications: [
            {
              id: `n-${token.id}-booked`,
              time: action.time,
              message: `Token ${token.id} confirmed for ${dept.name}, ${dept.room}.`,
              tone: 'info',
            },
            ...state.notifications,
          ],
          unread: state.unread + 1,
        },
      )
    }
    case 'CALL_NEXT':
    case 'SIMULATE': {
      const dept = findDept(action.deptId)
      if (!dept || !dept.open) return state
      const { tokens, entries } = advance(state.tokens, dept)
      return commit(state, tokens, entries, action.time)
    }
    case 'START_CONSULT': {
      const dept = findDept(action.deptId)
      const current = getServing(state.tokens, action.deptId)
      if (!dept || !current || current.status !== 'called') return state
      return commit(
        state,
        setStatus(state.tokens, current.id, 'consulting'),
        [{ message: `Token ${current.id} started consultation in ${dept.room}`, kind: 'consulting' }],
        action.time,
      )
    }
    case 'COMPLETE': {
      const dept = findDept(action.deptId)
      const current = getServing(state.tokens, action.deptId)
      if (!dept || !current) return state
      return commit(
        state,
        setStatus(state.tokens, current.id, 'completed'),
        [{ message: `Token ${current.id} completed in ${dept.room}`, kind: 'completed' }],
        action.time,
      )
    }
    case 'SKIP': {
      const dept = findDept(action.deptId)
      const current = getServing(state.tokens, action.deptId)
      if (!dept || !current) return state
      return commit(
        state,
        setStatus(state.tokens, current.id, 'skipped'),
        [{ message: `Token ${current.id} marked no-show in ${dept.room}`, kind: 'skipped' }],
        action.time,
      )
    }
    case 'CALL_TOKEN': {
      const target = state.tokens.find((t) => t.id === action.tokenId)
      const dept = target && findDept(target.deptId)
      if (!target || !dept || !dept.open || target.status !== 'waiting') return state
      const entries: Entry[] = []
      let tokens = state.tokens
      const current = getServing(tokens, dept.id)
      if (current) {
        tokens = setStatus(tokens, current.id, 'completed')
        entries.push({ message: `Token ${current.id} completed in ${dept.room}`, kind: 'completed' })
      }
      tokens = setStatus(tokens, target.id, 'called')
      entries.push({ message: `Token ${target.id} called in ${dept.room}`, kind: 'called' })
      return commit(state, tokens, entries, action.time)
    }
    case 'RECALL': {
      const target = state.tokens.find((t) => t.id === action.tokenId)
      if (!target || target.status !== 'skipped') return state
      return commit(
        state,
        setStatus(state.tokens, target.id, 'waiting'),
        [{ message: `Token ${target.id} rejoined the queue`, kind: 'booked' }],
        action.time,
      )
    }
    case 'TOGGLE_OPEN': {
      const dept = findDept(action.deptId)
      if (!dept) return state
      const departments = state.departments.map((d) => (d.id === dept.id ? { ...d, open: !d.open } : d))
      return commit(
        state,
        state.tokens,
        [{ message: `${dept.doctor} ${dept.open ? 'paused' : 'resumed'} queue in ${dept.room}`, kind: 'system' }],
        action.time,
        { departments },
      )
    }
    case 'WALK_IN': {
      const dept = findDept(action.deptId)
      if (!dept || !dept.open) return state
      const number = nextNumber(state.tokens, dept.id)
      const token: Token = {
        id: formatToken(dept.id, number),
        deptId: dept.id,
        number,
        name: action.name,
        age: action.age,
        type: 'Walk-In',
        arrival: action.time,
        status: 'waiting',
      }
      return commit(
        state,
        [...state.tokens, token],
        [{ message: `Walk-in token ${token.id} issued at kiosk`, kind: 'booked' }],
        action.time,
      )
    }
  }
}

function reducer(state: State, action: Action): State {
  const next = baseReducer(state, action)
  const token = next.tokens.find((t) => t.id === next.patientTokenId)
  const before = state.tokens.find((t) => t.id === next.patientTokenId)
  if (!token || !before || action.type === 'BOOK') return next

  const dept = next.departments.find((d) => d.id === token.deptId)
  const time = 'time' in action ? action.time : nowTime()
  const add = (message: string, tone: PatientNotification['tone']) => ({
    ...next,
    notifications: [{ id: `n-${next.seq}-${tone}`, time, message, tone }, ...next.notifications],
    unread: next.unread + 1,
  })

  if (before.status !== token.status) {
    if (token.status === 'called') return add(`It's your turn! Please proceed to ${dept?.room}.`, 'success')
    if (token.status === 'skipped') return add(`Token ${token.id} was marked as no-show. You can rejoin the queue.`, 'warning')
    if (token.status === 'completed') return add('Consultation completed. Get well soon!', 'info')
    return next
  }

  const ahead = getAhead(next.tokens, token)
  if (token.status === 'waiting' && ahead > 0 && ahead <= 3 && next.warnedTokenId !== token.id) {
    return { ...add(`Your turn is coming up — ${ahead} turns away.`, 'warning'), warnedTokenId: token.id }
  }
  return next
}

type QueueContextValue = {
  state: State
  login: (patient: Patient) => void
  logout: () => void
  book: (deptId: string) => void
  clearPatientToken: () => void
  callNext: (deptId: string) => void
  startConsult: (deptId: string) => void
  complete: (deptId: string) => void
  skip: (deptId: string) => void
  callToken: (tokenId: string) => void
  recall: (tokenId: string) => void
  toggleOpen: (deptId: string) => void
  readNotifications: () => void
}

const QueueContext = createContext<QueueContextValue | null>(null)

const initialState: State = {
  departments: DEPARTMENTS,
  tokens: createInitialTokens(),
  activity: INITIAL_ACTIVITY,
  patient: null,
  patientTokenId: null,
  initialAhead: 1,
  notifications: [],
  unread: 0,
  warnedTokenId: null,
  seq: 0,
}

const SIMULATION_INTERVAL_MS = 9000
const CONTROLLED_DEPT = 'CARD'

export function QueueProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let tick = 0
    const interval = setInterval(() => {
      tick++
      const auto = DEPARTMENTS.filter((d) => d.id !== CONTROLLED_DEPT)
      const dept = auto[Math.floor(Math.random() * auto.length)]
      dispatch({ type: 'SIMULATE', deptId: dept.id, time: nowTime() })
      if (tick % 2 === 0) {
        const target = DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)]
        dispatch({
          type: 'WALK_IN',
          deptId: target.id,
          name: PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)],
          age: 5 + Math.floor(Math.random() * 75),
          time: nowTime(),
        })
      }
    }, SIMULATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const value = useMemo<QueueContextValue>(
    () => ({
      state,
      login: (patient) => dispatch({ type: 'LOGIN', patient }),
      logout: () => dispatch({ type: 'LOGOUT' }),
      book: (deptId) => dispatch({ type: 'BOOK', deptId, time: nowTime() }),
      clearPatientToken: () => dispatch({ type: 'CLEAR_PATIENT_TOKEN' }),
      callNext: (deptId) => dispatch({ type: 'CALL_NEXT', deptId, time: nowTime() }),
      startConsult: (deptId) => dispatch({ type: 'START_CONSULT', deptId, time: nowTime() }),
      complete: (deptId) => dispatch({ type: 'COMPLETE', deptId, time: nowTime() }),
      skip: (deptId) => dispatch({ type: 'SKIP', deptId, time: nowTime() }),
      callToken: (tokenId) => dispatch({ type: 'CALL_TOKEN', tokenId, time: nowTime() }),
      recall: (tokenId) => dispatch({ type: 'RECALL', tokenId, time: nowTime() }),
      toggleOpen: (deptId) => dispatch({ type: 'TOGGLE_OPEN', deptId, time: nowTime() }),
      readNotifications: () => dispatch({ type: 'READ_NOTIFICATIONS' }),
    }),
    [state],
  )

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within QueueProvider')
  return ctx
}
