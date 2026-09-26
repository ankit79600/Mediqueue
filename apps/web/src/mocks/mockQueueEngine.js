// Test-only mock of the queue state machine, used solely so Staff queue actions
// (Call Next / Skip / No-show / Complete) can be exercised end-to-end without a
// running backend. Mirrors DATABASE_SCHEMA.md §4.1 (status transitions) and §4.2
// (skip requeue position) and returns exactly the shapes from API_CONTRACT.md
// §4 E17-E20 (including error codes). This is NOT shipped business logic — the
// real backend (queue.service.js) is the only authority in production; this
// module is swapped out for real REST calls whenever VITE_USE_MOCKS is false.
import { ApiError } from '@/lib/api.js';
import { queueSnapshot as baseSnapshot } from './fixtures.js';

const doctorStates = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getState(doctorId) {
  if (!doctorStates.has(doctorId)) {
    const base = clone(baseSnapshot);
    doctorStates.set(doctorId, { current: base.current, waiting: base.waiting, stats: base.stats });
  }
  return doctorStates.get(doctorId);
}

function recomputePositions(waiting) {
  waiting.forEach((token, index) => {
    token.position = index + 1;
    token.peopleAhead = index;
  });
}

function snapshotFor(doctorId) {
  const state = getState(doctorId);
  return {
    ...clone(baseSnapshot),
    current: state.current,
    waiting: state.waiting,
    stats: state.stats,
    generatedAt: new Date().toISOString(),
  };
}

function findDoctorIdForToken(tokenId) {
  for (const [doctorId, state] of doctorStates) {
    if (state.current?.id === tokenId) return doctorId;
  }
  return null;
}

/** Used by mockSocket.js for the initial subscribe snapshot (and by the hook's
 * polling-fallback path) so every mock consumer reads the same mutable state. */
export function getSnapshot(doctorId) {
  return snapshotFor(doctorId);
}

export async function mockCallNext(doctorId) {
  await delay();
  const state = getState(doctorId);
  if (state.current) {
    throw new ApiError(409, 'CONSULT_IN_PROGRESS', 'A patient is already in consultation.', {
      tokenId: state.current.id,
    });
  }
  if (state.waiting.length === 0) {
    throw new ApiError(409, 'QUEUE_EMPTY', 'No patients are waiting.');
  }
  const [next, ...rest] = state.waiting;
  next.status = 'CALLED';
  next.calledAt = new Date().toISOString();
  next.position = 0;
  next.peopleAhead = null;
  next.estimatedWaitMin = null;
  next.estimatedCallAt = null;
  state.current = next;
  state.waiting = rest;
  recomputePositions(state.waiting);
  state.stats.waitingCount = state.waiting.length;
  return { token: clone(next), queue: snapshotFor(doctorId) };
}

export async function mockSkip(tokenId) {
  await delay();
  const doctorId = findDoctorIdForToken(tokenId);
  const state = doctorId && getState(doctorId);
  if (!state?.current || state.current.id !== tokenId || state.current.status !== 'CALLED') {
    throw new ApiError(409, 'INVALID_STATE', 'This token is not currently in consultation.');
  }
  const token = state.current;
  token.skipCount += 1;
  let result;
  if (token.skipCount >= 2) {
    token.status = 'NO_SHOW';
    token.endedAt = new Date().toISOString();
    result = 'NO_SHOW';
  } else {
    token.status = 'WAITING';
    token.calledAt = null;
    // DATABASE_SCHEMA.md §4.2: behind 3 waiting tokens (or at the end if fewer).
    const insertAt = Math.min(3, state.waiting.length);
    state.waiting.splice(insertAt, 0, token);
    result = 'REQUEUED';
  }
  state.current = null;
  recomputePositions(state.waiting);
  state.stats.waitingCount = state.waiting.length;
  if (result === 'NO_SHOW') state.stats.noShowToday += 1;
  return { token: clone(token), queue: snapshotFor(doctorId), result };
}

export async function mockNoShow(tokenId) {
  await delay();
  const doctorId = findDoctorIdForToken(tokenId);
  const state = doctorId && getState(doctorId);
  if (!state?.current || state.current.id !== tokenId || state.current.status !== 'CALLED') {
    throw new ApiError(409, 'INVALID_STATE', 'This token is not currently in consultation.');
  }
  const token = state.current;
  token.status = 'NO_SHOW';
  token.endedAt = new Date().toISOString();
  state.current = null;
  state.stats.noShowToday += 1;
  return { token: clone(token), queue: snapshotFor(doctorId) };
}

export async function mockComplete(tokenId) {
  await delay();
  const doctorId = findDoctorIdForToken(tokenId);
  const state = doctorId && getState(doctorId);
  if (!state?.current || state.current.id !== tokenId || state.current.status !== 'CALLED') {
    throw new ApiError(409, 'INVALID_STATE', 'This token is not currently in consultation.');
  }
  const token = state.current;
  token.status = 'COMPLETED';
  token.endedAt = new Date().toISOString();
  state.current = null;
  state.stats.servedToday += 1;
  return { token: clone(token), queue: snapshotFor(doctorId) };
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}
