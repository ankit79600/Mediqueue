/**
 * smoke.mjs — Ordered HTTP integration tests for all REST endpoints (E1–E25).
 *
 * Usage:  node apps/server/scripts/smoke.mjs
 * Needs:  server running on BASE_URL (default http://localhost:4000/api/v1)
 *         DEMO_MODE=true in .env (for devOtp in auth section)
 *
 * Exits non-zero on first failure with a clear message.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load .env from the server app directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dotenv  = require('dotenv');
dotenv.config({ path: resolve(__dirname, '../.env') });

const BASE    = process.env.SMOKE_URL ?? 'http://localhost:4000/api/v1';
const TIMEOUT = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fail(msg) {
  console.error(`\n❌  FAIL: ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`  ✔ ${msg}`);
}

function section(name) {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 55 - name.length))}`);
}

async function req(method, path, { body, token, headers: extra = {} } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });

  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function assertStatus(r, expected, ctx) {
  if (r.status !== expected)
    fail(`${ctx}: expected HTTP ${expected}, got ${r.status} — ${JSON.stringify(r.body)}`);
  pass(`${ctx} → ${r.status}`);
}

function assertCode(r, code, ctx) {
  const got = r.body?.error?.code;
  if (got !== code)
    fail(`${ctx}: expected error.code "${code}", got "${got}" — ${JSON.stringify(r.body)}`);
  pass(`${ctx} error.code = ${code}`);
}

function assertKeys(obj, keys, ctx) {
  for (const k of keys) {
    if (!(k in obj))
      fail(`${ctx}: missing key "${k}" in ${JSON.stringify(Object.keys(obj))}`);
  }
  pass(`${ctx} has required keys`);
}

// ─── Test state ───────────────────────────────────────────────────────────────

const state = {};

// ─── §1  Health ───────────────────────────────────────────────────────────────

section('§1  E1  Health');

{
  const r = await req('GET', '/health');
  assertStatus(r, 200, 'GET /health');
  assertKeys(r.body, ['status', 'db', 'time', 'version'], 'health body');
  if (r.body.status !== 'ok') fail('health.status !== "ok"');
  pass('health.status = "ok"');

  const r404 = await req('GET', '/nonexistent-path-xyz');
  assertStatus(r404, 404, 'GET /nonexistent-path → 404');
  assertCode(r404, 'NOT_FOUND', 'unknown route');
}

// ─── §2  Auth ─────────────────────────────────────────────────────────────────

section('§2  E2–E4  Auth');

const TEST_PHONE = process.env.SMOKE_PHONE ?? '9800000001';

{
  // E2: Request OTP — bad phone (returns INVALID_PHONE or VALIDATION_ERROR per API_CONTRACT)
  const bad = await req('POST', '/auth/otp/request', { body: { phone: '123' } });
  assertStatus(bad, 400, 'E2 bad phone');
  const badCode = bad.body?.error?.code;
  if (badCode !== 'VALIDATION_ERROR' && badCode !== 'INVALID_PHONE')
    fail(`E2 bad phone: expected VALIDATION_ERROR or INVALID_PHONE, got "${badCode}"`);
  pass(`E2 bad phone error.code = ${badCode}`);

  // E2: Request OTP — good phone
  const r = await req('POST', '/auth/otp/request', { body: { phone: TEST_PHONE } });
  assertStatus(r, 200, 'E2 request OTP');
  assertKeys(r.body, ['phone', 'expiresInSec', 'resendAfterSec'], 'E2 body');

  if (!r.body.devOtp) {
    fail(
      'E2: devOtp missing — server must run with DEMO_MODE=true for smoke test auth to work.\n' +
      '  Set DEMO_MODE=true in .env and restart the server.',
    );
  }
  pass('E2 devOtp present (DEMO_MODE=true)');
  state.devOtp = r.body.devOtp;

  // E3: Verify OTP — wrong code
  const wrong = await req('POST', '/auth/otp/verify', {
    body: { phone: TEST_PHONE, code: '000000' },
  });
  if (wrong.status === 400) {
    assertCode(wrong, 'OTP_INVALID', 'E3 wrong OTP');
  } else if (wrong.status === 429) {
    assertCode(wrong, 'OTP_TOO_MANY_ATTEMPTS', 'E3 too many attempts (acceptable)');
  } else {
    fail(`E3 wrong OTP: unexpected status ${wrong.status}`);
  }

  // E3: Verify OTP — correct code
  const vr = await req('POST', '/auth/otp/verify', {
    body: { phone: TEST_PHONE, code: state.devOtp },
  });
  assertStatus(vr, 200, 'E3 verify OTP');
  assertKeys(vr.body, ['accessToken', 'expiresIn', 'isNewPatient', 'patient'], 'E3 body');
  state.patientJwt = vr.body.accessToken;
  pass(`E3 patient JWT obtained`);

  // E4: Staff login — wrong password
  const sw = await req('POST', '/auth/staff/login', {
    body: { username: 'admin', password: 'wrongpassword' },
  });
  assertStatus(sw, 401, 'E4 wrong password');
  assertCode(sw, 'INVALID_CREDENTIALS', 'E4 wrong password');

  // E4: Staff login — dr.sen
  const sd = await req('POST', '/auth/staff/login', {
    body: { username: 'dr.sen', password: 'demo123' },
  });
  assertStatus(sd, 200, 'E4 dr.sen login');
  assertKeys(sd.body, ['accessToken', 'staff'], 'E4 dr.sen body');
  state.staffJwt      = sd.body.accessToken;
  state.staffDoctorId = sd.body.staff.doctorId;
  state.staffDeptId   = sd.body.staff.departmentId ?? null;
  pass(`E4 staff JWT obtained  doctorId=${state.staffDoctorId}`);

  // E4: Staff login — dr.patel (for FORBIDDEN tests)
  const sp = await req('POST', '/auth/staff/login', {
    body: { username: 'dr.patel', password: 'demo123' },
  });
  assertStatus(sp, 200, 'E4 dr.patel login');
  state.staffPatelJwt = sp.body.accessToken;

  // E4: Admin login
  const ad = await req('POST', '/auth/staff/login', {
    body: { username: 'admin', password: 'admin123' },
  });
  assertStatus(ad, 200, 'E4 admin login');
  state.adminJwt = ad.body.accessToken;
  pass('E4 admin JWT obtained');
}

// ─── §3  Patient profile ──────────────────────────────────────────────────────

section('§3  E5–E6  Patient profile');

{
  // E5: No token → 401
  const unauth = await req('GET', '/patients/me');
  assertStatus(unauth, 401, 'E5 no token → 401');

  // E5: Get profile
  const r = await req('GET', '/patients/me', { token: state.patientJwt });
  assertStatus(r, 200, 'E5 GET /patients/me');
  assertKeys(r.body, ['id', 'phone', 'phoneMasked', 'name', 'age', 'gender', 'consentAt', 'profileComplete'], 'E5 Patient keys');

  // E6: Update profile (consent required)
  const up = await req('PUT', '/patients/me', {
    token: state.patientJwt,
    body: { name: 'Test Patient', age: 30, gender: 'MALE', consent: true },
  });
  assertStatus(up, 200, 'E6 PUT /patients/me');
  if (!up.body.profileComplete) fail('E6: profileComplete should be true after update');
  pass('E6 profileComplete = true');
}

// ─── §4  Catalog ──────────────────────────────────────────────────────────────

section('§4  E7–E8  Catalog');

{
  // E7: GET /departments
  const dr = await req('GET', '/departments');
  assertStatus(dr, 200, 'E7 GET /departments');
  if (!Array.isArray(dr.body.departments) || dr.body.departments.length === 0)
    fail('E7: departments array empty or missing');
  assertKeys(dr.body, ['departments', 'serviceDate'], 'E7 body');
  pass(`E7 ${dr.body.departments.length} departments`);

  // Find GM department and dr.sen's doctor record
  state.gmDept = dr.body.departments.find(d => d.code === 'GM');
  if (!state.gmDept) fail('E7: GM department not found in seed data');

  // Find dr.sen from departments doctors list
  const senDoctor = state.gmDept.doctors?.find(d => d.id === state.staffDoctorId);
  state.senDoctorId = state.staffDoctorId;
  pass(`E7 GM dept found, dr.sen id=${state.senDoctorId}`);

  // E8: GET /doctors/:doctorId/slots
  const sr = await req('GET', `/doctors/${state.senDoctorId}/slots`);
  assertStatus(sr, 200, 'E8 GET /doctors/:id/slots');
  assertKeys(sr.body, ['doctorId', 'date', 'slots'], 'E8 body');
  pass(`E8 ${sr.body.slots.length} slots`);
}

// ─── §5  Token lifecycle ──────────────────────────────────────────────────────

section('§5  E9–E14  Token lifecycle');

{
  // E9: Create token
  const cr = await req('POST', '/tokens', {
    token: state.patientJwt,
    body: { departmentId: state.gmDept.id, doctorId: state.senDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
  });
  // Could be 201 (new) or 409 ACTIVE_TOKEN_EXISTS (token from previous run)
  if (cr.status === 409 && cr.body?.error?.code === 'ACTIVE_TOKEN_EXISTS') {
    pass('E9 token exists from previous run — will cancel it first');
    // Cancel the existing active token
    const me = await req('GET', '/tokens/me', { token: state.patientJwt });
    const activeToken = me.body.active?.[0];
    if (!activeToken) fail('E9 ACTIVE_TOKEN_EXISTS but no active token found');
    await req('DELETE', `/tokens/${activeToken.id}`, { token: state.patientJwt });
    // Retry create
    const retry = await req('POST', '/tokens', {
      token: state.patientJwt,
      body: { departmentId: state.gmDept.id, doctorId: state.senDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
    });
    assertStatus(retry, 201, 'E9 POST /tokens (retry after cancel)');
    state.testToken = retry.body;
  } else {
    assertStatus(cr, 201, 'E9 POST /tokens');
    state.testToken = cr.body;
  }

  assertKeys(state.testToken, [
    'id', 'tokenNo', 'status', 'type', 'priority',
    'departmentId', 'doctorId', 'slotId', 'slotTime', 'serviceDate',
    'patient', 'position', 'peopleAhead', 'estimatedWaitMin', 'estimatedCallAt',
    'createdAt', 'calledAt', 'endedAt', 'skipCount', 'notifiedThreeAway',
    'etaSource', 'trackUrl', 'qrPayload', 'updatedAt',
  ], 'E9 Token keys');
  pass(`E9 token created: ${state.testToken.tokenNo}  position=${state.testToken.position}`);

  // E9: Double-create → ACTIVE_TOKEN_EXISTS
  const dup = await req('POST', '/tokens', {
    token: state.patientJwt,
    body: { departmentId: state.gmDept.id, doctorId: state.senDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
  });
  assertStatus(dup, 409, 'E9 duplicate create');
  assertCode(dup, 'ACTIVE_TOKEN_EXISTS', 'E9 duplicate create');

  // E10: GET /tokens/me
  const me = await req('GET', '/tokens/me', { token: state.patientJwt });
  assertStatus(me, 200, 'E10 GET /tokens/me');
  assertKeys(me.body, ['active', 'history'], 'E10 body');
  if (!me.body.active.some(t => t.id === state.testToken.id))
    fail('E10: created token not in active list');
  pass('E10 token in active list');

  // E11: GET /tokens/:id
  const tr = await req('GET', `/tokens/${state.testToken.id}`, { token: state.patientJwt });
  assertStatus(tr, 200, 'E11 GET /tokens/:id');
  if (tr.body.id !== state.testToken.id) fail('E11: wrong token id');
  pass('E11 token fetched');

  // E13: Public token — good sig (extracted from trackUrl)
  const sigMatch = state.testToken.trackUrl?.match(/\?s=([0-9a-f]+)/);
  if (!sigMatch) fail('E13: could not extract sig from trackUrl');
  const goodSig = sigMatch[1];

  const pub = await req('GET', `/public/tokens/${state.testToken.id}?s=${goodSig}`);
  assertStatus(pub, 200, 'E13 public token (good sig)');
  assertKeys(pub.body, ['id', 'tokenNo', 'status', 'departmentName', 'doctorName', 'room',
    'position', 'peopleAhead', 'estimatedWaitMin', 'estimatedCallAt', 'updatedAt'], 'E13 TokenPublic keys');

  // E13: Public token — bad sig
  const badPub = await req('GET', `/public/tokens/${state.testToken.id}?s=badbadsig1234567`);
  assertStatus(badPub, 403, 'E13 public token (bad sig)');
  assertCode(badPub, 'INVALID_SIGNATURE', 'E13 bad sig');

  // E14: Display snapshot
  const disp = await req('GET', `/public/display/${state.gmDept.id}`);
  assertStatus(disp, 200, 'E14 display snapshot');
  assertKeys(disp.body, ['department', 'nowServing', 'upNext', 'queueLength', 'generatedAt'], 'E14 DisplaySnapshot keys');

  // E14: Unknown dept → 404
  const nodisp = await req('GET', '/public/display/00000000-0000-0000-0000-000000000000');
  assertStatus(nodisp, 404, 'E14 unknown dept → 404');

  // E12: Cancel token
  const del = await req('DELETE', `/tokens/${state.testToken.id}`, { token: state.patientJwt });
  assertStatus(del, 200, 'E12 DELETE /tokens/:id');
  if (del.body.status !== 'CANCELLED') fail(`E12: expected CANCELLED, got ${del.body.status}`);
  pass('E12 token cancelled');
}

// ─── §6  Staff operations ─────────────────────────────────────────────────────

section('§6  E16–E20  Staff operations');

{
  // E16: GET /staff/doctors/:doctorId/queue
  const qr = await req('GET', `/staff/doctors/${state.senDoctorId}/queue`, { token: state.staffJwt });
  assertStatus(qr, 200, 'E16 GET queue');
  assertKeys(qr.body, ['doctor', 'department', 'current', 'waiting', 'stats', 'generatedAt'], 'E16 QueueSnapshot keys');
  pass(`E16 queue: ${qr.body.stats.waitingCount} waiting`);

  // E16: STAFF of dr.patel accessing dr.sen → 403
  const forbidden = await req('GET', `/staff/doctors/${state.senDoctorId}/queue`, {
    token: state.staffPatelJwt,
  });
  assertStatus(forbidden, 403, 'E16 cross-doctor access → 403');
  assertCode(forbidden, 'FORBIDDEN', 'E16 cross-doctor');

  // If there's already a CALLED token, complete it to get a clean state
  if (qr.body.current) {
    const comp = await req('POST', `/staff/tokens/${qr.body.current.id}/complete`, {
      token: state.staffJwt, body: {},
    });
    assertStatus(comp, 200, 'E20 pre-clean: complete existing CALLED token');
  }

  // E17: Call next
  const cn = await req('POST', `/staff/doctors/${state.senDoctorId}/call-next`, {
    token: state.staffJwt, body: {},
  });
  if (cn.status === 409 && cn.body?.error?.code === 'QUEUE_EMPTY') {
    pass('E17 QUEUE_EMPTY — no seeded tokens; skipping staff action chain');
  } else {
    assertStatus(cn, 200, 'E17 call-next');
    assertKeys(cn.body, ['token', 'queue'], 'E17 body');
    if (cn.body.token.status !== 'CALLED') fail(`E17: expected CALLED, got ${cn.body.token.status}`);
    pass(`E17 called token: ${cn.body.token.tokenNo}`);
    state.calledToken = cn.body.token;

    // E17: Double call-next → CONSULT_IN_PROGRESS
    const cn2 = await req('POST', `/staff/doctors/${state.senDoctorId}/call-next`, {
      token: state.staffJwt, body: {},
    });
    assertStatus(cn2, 409, 'E17 double call-next');
    assertCode(cn2, 'CONSULT_IN_PROGRESS', 'E17 double call-next');

    // E18: Skip
    const sk = await req('POST', `/staff/tokens/${state.calledToken.id}/skip`, {
      token: state.staffJwt, body: {},
    });
    assertStatus(sk, 200, 'E18 skip');
    assertKeys(sk.body, ['token', 'queue', 'result'], 'E18 body');
    pass(`E18 skip result = ${sk.body.result}`);

    // E17 again: call-next (after skip)
    const cn3 = await req('POST', `/staff/doctors/${state.senDoctorId}/call-next`, {
      token: state.staffJwt, body: {},
    });
    if (cn3.status === 409 && cn3.body?.error?.code === 'QUEUE_EMPTY') {
      pass('E17 QUEUE_EMPTY after skip — skipping no-show / complete tests');
    } else {
      assertStatus(cn3, 200, 'E17 call-next (2)');
      const calledToken2 = cn3.body.token;

      // E19: No-show
      const ns = await req('POST', `/staff/tokens/${calledToken2.id}/no-show`, {
        token: state.staffJwt, body: {},
      });
      assertStatus(ns, 200, 'E19 no-show');
      if (ns.body.token.status !== 'NO_SHOW') fail(`E19: expected NO_SHOW, got ${ns.body.token.status}`);
      pass('E19 no-show ok');

      // E17 again: call-next for complete test
      const cn4 = await req('POST', `/staff/doctors/${state.senDoctorId}/call-next`, {
        token: state.staffJwt, body: {},
      });
      if (cn4.status === 200) {
        // E20: Complete
        const cp = await req('POST', `/staff/tokens/${cn4.body.token.id}/complete`, {
          token: state.staffJwt, body: {},
        });
        assertStatus(cp, 200, 'E20 complete');
        if (cp.body.token.status !== 'COMPLETED') fail(`E20: expected COMPLETED`);
        pass('E20 complete ok');
      } else {
        pass('E17 QUEUE_EMPTY — E20 skipped');
      }
    }
  }
}

// ─── §7  Admin ────────────────────────────────────────────────────────────────

section('§7  E21–E25  Admin');

{
  // E21: non-admin → 403
  const noAdmin = await req('GET', '/admin/stats', { token: state.staffJwt });
  assertStatus(noAdmin, 403, 'E21 non-admin → 403');
  assertCode(noAdmin, 'FORBIDDEN', 'E21 non-admin');

  // E21: Admin stats
  const sr = await req('GET', '/admin/stats', { token: state.adminJwt });
  assertStatus(sr, 200, 'E21 GET /admin/stats');
  assertKeys(sr.body, ['serviceDate', 'totals', 'departments', 'hourly', 'generatedAt'], 'E21 AdminStats keys');
  assertKeys(sr.body.totals, ['waiting', 'inConsultation', 'completedToday', 'noShowToday', 'cancelledToday', 'avgWaitMin', 'activeDoctors'], 'E21 totals keys');
  pass(`E21 stats: ${sr.body.totals.waiting} waiting, ${sr.body.totals.completedToday} completed`);

  // E22: Notifications
  const nr = await req('GET', '/admin/notifications', { token: state.adminJwt });
  assertStatus(nr, 200, 'E22 GET /admin/notifications');
  assertKeys(nr.body, ['items', 'nextBefore'], 'E22 body');
  pass(`E22 ${nr.body.items.length} notifications`);

  // E22: Pagination param validation
  const nrBad = await req('GET', '/admin/notifications?limit=999', { token: state.adminJwt });
  assertStatus(nrBad, 400, 'E22 limit=999 → 400');

  // E23: Simulator status
  const simr = await req('GET', '/admin/simulator', { token: state.adminJwt });
  assertStatus(simr, 200, 'E23 GET /admin/simulator');
  assertKeys(simr.body, ['running', 'speed', 'startedAt', 'tokensCreated', 'actionsPerformed'], 'E23 SimulatorStatus keys');
  pass(`E23 simulator running=${simr.body.running}`);

  // E24: Start simulator
  const start = await req('POST', '/admin/simulator', {
    token: state.adminJwt,
    body: { action: 'start', speed: 1, arrivalsPerMin: 1 },
  });
  assertStatus(start, 200, 'E24 start simulator');
  if (!start.body.running) fail('E24: running should be true after start');
  pass('E24 simulator started');

  // E24: Start again → INVALID_STATE
  const dup = await req('POST', '/admin/simulator', {
    token: state.adminJwt,
    body: { action: 'start', speed: 1 },
  });
  assertStatus(dup, 409, 'E24 double start');
  assertCode(dup, 'INVALID_STATE', 'E24 double start');

  // E24: Stop simulator
  const stop = await req('POST', '/admin/simulator', {
    token: state.adminJwt,
    body: { action: 'stop' },
  });
  assertStatus(stop, 200, 'E24 stop simulator');
  if (stop.body.running) fail('E24: running should be false after stop');
  pass('E24 simulator stopped');

  // E24: Bad request body
  const badSim = await req('POST', '/admin/simulator', {
    token: state.adminJwt,
    body: { action: 'fly' },
  });
  assertStatus(badSim, 400, 'E24 invalid action → 400');

  // E25: Demo reset (only if DEMO_MODE is set)
  if (process.env.DEMO_MODE === 'true') {
    const dr = await req('POST', '/admin/demo/reset', { token: state.adminJwt, body: {} });
    assertStatus(dr, 200, 'E25 POST /admin/demo/reset');
    if (!dr.body.ok) fail('E25: body.ok should be true');
    pass(`E25 demo reset: tokensSeeded=${dr.body.tokensSeeded}`);
  } else {
    // Should be forbidden when DEMO_MODE=false
    pass('E25 skipped (DEMO_MODE is not true)');
  }
}

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log('\n✅  smoke PASSED\n');
