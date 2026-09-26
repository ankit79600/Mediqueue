// Test-only mock standing in for E23-E25 (GET/POST /admin/simulator,
// POST /admin/demo/reset) so the Admin simulator/demo controls can be
// exercised without a backend. NOT the real simulator engine (that's
// simulator/engine.js, backend-owned per TEAM_TASKS.md D6) — this only
// mimics the documented request/response/error shapes from API_CONTRACT.md.
import { ApiError } from '@/lib/api.js';
import { simulatorStatus as baseSimulatorStatus } from './fixtures.js';

let state = { ...baseSimulatorStatus };

export function getSimulatorStatus() {
  return { ...state };
}

export function setSimulatorStatus({ action, speed = 10, arrivalsPerMin = 6 }) {
  if (action === 'start') {
    if (state.running) {
      throw new ApiError(409, 'INVALID_STATE', 'The simulator is already running.');
    }
    state = { running: true, speed, startedAt: new Date().toISOString(), tokensCreated: 0, actionsPerformed: 0 };
  } else if (action === 'stop') {
    if (!state.running) {
      throw new ApiError(409, 'INVALID_STATE', 'The simulator is not running.');
    }
    state = { ...state, running: false };
  }
  void arrivalsPerMin; // accepted per E24, not simulated here
  return { ...state };
}

export function demoReset() {
  state = { ...baseSimulatorStatus };
  return { ok: true, tokensSeeded: 40 };
}
