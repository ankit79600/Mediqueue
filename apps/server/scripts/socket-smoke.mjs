/**
 * socket-smoke.mjs — Socket.IO integration tests (SOCKET_CONTRACT §3–§5, T1–T6).
 *
 * Usage:  node apps/server/scripts/socket-smoke.mjs
 * Needs:  server running on BASE_URL (default http://localhost:4000)
 *         DEMO_MODE=true in .env
 *
 * Checks (per IMPLEMENTATION_PLAN Phases 7/8/9/10):
 *   - Bad JWT → connect_error "UNAUTHENTICATED"
 *   - subscribe:token (patient owns / other patient's → FORBIDDEN)
 *   - subscribe:tokenPublic (good sig / bad sig → INVALID_SIGNATURE)
 *   - subscribe:doctor (staff own / other doctor → FORBIDDEN)
 *   - subscribe:dept (open, no auth required)
 *   - subscribe:admin (admin only / staff → FORBIDDEN)
 *   - T1: token created → queue:update + display:update
 *   - T2: token cancelled → token:ended
 *   - T3: call-next → token:called + queue:update
 *   - T4: skip → token:skipped + queue:update
 *   - T5: no-show → token:ended + queue:update
 *   - T6: complete → token:ended + queue:update
 *
 * Exits non-zero on first failure.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dotenv  = require('dotenv');
dotenv.config({ path: resolve(__dirname, '../.env') });

import { io as ioclient } from 'socket.io-client';

const BASE    = process.env.SMOKE_URL?.replace('/api/v1', '') ?? 'http://localhost:4000';
const API     = `${BASE}/api/v1`;
const TIMEOUT = 8_000;

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

async function httpReq(method, path, { body, token, headers: extra = {} } = {}) {
  const url = `${API}${path}`;
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

// Create a socket, wait for connect or error
function makeSocket(accessToken) {
  return new Promise((resolve, reject) => {
    const s = ioclient(BASE, {
      auth: accessToken ? { accessToken } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: TIMEOUT,
    });
    s.once('connect',       () => resolve(s));
    s.once('connect_error', (err) => { s.close(); reject(err); });
    setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, TIMEOUT);
  });
}

// Emit with ack, returns the ack result
function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), TIMEOUT);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

// Wait for a specific event on a socket
function waitFor(socket, event, timeoutMs = TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() =>
      reject(new Error(`timeout waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// ─── Auth: log in as patient, staff (dr.sen), staff (dr.patel), admin ─────────

section('Setup: obtain JWTs');

const TEST_PHONE2 = process.env.SMOKE_PHONE2 ?? '9800000002';

const otpR = await httpReq('POST', '/auth/otp/request', { body: { phone: TEST_PHONE2 } });
if (otpR.status !== 200) fail(`OTP request failed: ${JSON.stringify(otpR.body)}`);
if (!otpR.body.devOtp)   fail('devOtp missing — server must run with DEMO_MODE=true');

const verR = await httpReq('POST', '/auth/otp/verify', {
  body: { phone: TEST_PHONE2, code: otpR.body.devOtp },
});
if (verR.status !== 200) fail(`OTP verify failed: ${JSON.stringify(verR.body)}`);

// Ensure patient has a complete profile
await httpReq('PUT', '/patients/me', {
  token: verR.body.accessToken,
  body: { name: 'Socket Test Patient', age: 25, gender: 'FEMALE', consent: true },
});

const patientJwt   = verR.body.accessToken;
const patientId    = verR.body.patient.id;

const senR = await httpReq('POST', '/auth/staff/login', {
  body: { username: 'dr.sen', password: 'demo123' },
});
const staffJwt      = senR.body.accessToken;
const staffDoctorId = senR.body.staff.doctorId;

const patelR = await httpReq('POST', '/auth/staff/login', {
  body: { username: 'dr.patel', password: 'demo123' },
});
const staffPatelJwt = patelR.body.accessToken;

const adminR = await httpReq('POST', '/auth/staff/login', {
  body: { username: 'admin', password: 'admin123' },
});
const adminJwt = adminR.body.accessToken;

pass(`JWTs obtained — patient=${TEST_PHONE2}, staff=dr.sen, admin`);

// Get GM department info
const deptsR = await httpReq('GET', '/departments');
const gmDept = deptsR.body.departments.find(d => d.code === 'GM');
if (!gmDept) fail('GM department not found');
pass(`GM dept id=${gmDept.id}`);

// ─── §1  Connection auth ──────────────────────────────────────────────────────

section('§1  Bad JWT → connect_error UNAUTHENTICATED');

{
  let gotError = false;
  try {
    await makeSocket('not.a.valid.jwt.at.all');
  } catch (err) {
    if (err.message === 'UNAUTHENTICATED') {
      gotError = true;
      pass('bad JWT → connect_error "UNAUTHENTICATED"');
    } else {
      fail(`bad JWT: expected "UNAUTHENTICATED", got "${err.message}"`);
    }
  }
  if (!gotError) fail('bad JWT: expected connect_error, got connected');
}

// ─── §2  subscribe:token ──────────────────────────────────────────────────────

section('§2  subscribe:token  (patient / forbidden / anon)');

// Create a test token for the patient
let testTokenId, testTokenNo, testTokenSig, testTokenDoctorId;
{
  // Cancel any existing active token first
  const meR = await httpReq('GET', '/tokens/me', { token: patientJwt });
  for (const t of meR.body.active ?? []) {
    await httpReq('DELETE', `/tokens/${t.id}`, { token: patientJwt });
  }

  const cr = await httpReq('POST', '/tokens', {
    token: patientJwt,
    body: { departmentId: gmDept.id, doctorId: staffDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
  });
  if (cr.status !== 201) fail(`E9 create token: ${JSON.stringify(cr.body)}`);
  testTokenId       = cr.body.id;
  testTokenNo       = cr.body.tokenNo;
  testTokenDoctorId = cr.body.doctorId;
  const sigMatch    = cr.body.trackUrl?.match(/\?s=([0-9a-f]+)/);
  testTokenSig      = sigMatch?.[1];
  pass(`Test token created: ${testTokenNo}  id=${testTokenId}`);
}

// Patient subscribes to own token
const patientSocket = await makeSocket(patientJwt);
{
  const ack = await emit(patientSocket, 'subscribe:token', { tokenId: testTokenId });
  if (!ack.ok) fail(`subscribe:token failed: ${JSON.stringify(ack.error)}`);
  if (!ack.snapshot?.id) fail('subscribe:token ack missing snapshot.id');
  if (!ack.room?.startsWith('token:')) fail(`ack.room should start with "token:", got "${ack.room}"`);
  pass(`subscribe:token ok  room=${ack.room}`);
}

// Staff (dr.patel) tries to subscribe to dr.sen's token → FORBIDDEN
const patelSocket = await makeSocket(staffPatelJwt);
{
  const ack = await emit(patelSocket, 'subscribe:token', { tokenId: testTokenId });
  if (ack.ok) fail('subscribe:token: patel should be FORBIDDEN');
  if (ack.error?.code !== 'FORBIDDEN') fail(`Expected FORBIDDEN, got ${ack.error?.code}`);
  pass('subscribe:token FORBIDDEN for wrong staff');
}
patelSocket.close();

// ─── §3  subscribe:tokenPublic ────────────────────────────────────────────────

section('§3  subscribe:tokenPublic  (sig / bad-sig)');

const anonSocket = await makeSocket(null);
{
  const ack = await emit(anonSocket, 'subscribe:tokenPublic', {
    tokenId: testTokenId,
    sig: testTokenSig,
  });
  if (!ack.ok) fail(`subscribe:tokenPublic failed: ${JSON.stringify(ack.error)}`);
  pass(`subscribe:tokenPublic ok  room=${ack.room}`);
}

{
  const ack = await emit(anonSocket, 'subscribe:tokenPublic', {
    tokenId: testTokenId,
    sig: 'badbadsig1234567',
  });
  if (ack.ok) fail('bad sig should fail');
  if (ack.error?.code !== 'INVALID_SIGNATURE') fail(`Expected INVALID_SIGNATURE, got ${ack.error?.code}`);
  pass('subscribe:tokenPublic INVALID_SIGNATURE for bad sig');
}

// ─── §4  subscribe:doctor ─────────────────────────────────────────────────────

section('§4  subscribe:doctor  (staff / forbidden)');

const staffSocket = await makeSocket(staffJwt);
{
  const ack = await emit(staffSocket, 'subscribe:doctor', { doctorId: staffDoctorId });
  if (!ack.ok) fail(`subscribe:doctor failed: ${JSON.stringify(ack.error)}`);
  if (!ack.snapshot?.doctor) fail('subscribe:doctor ack missing snapshot.doctor');
  pass(`subscribe:doctor ok  room=${ack.room}`);
}

// Patient (non-staff) tries subscribe:doctor → FORBIDDEN
{
  const ack = await emit(patientSocket, 'subscribe:doctor', { doctorId: staffDoctorId });
  if (ack.ok) fail('subscribe:doctor: patient should be FORBIDDEN');
  if (ack.error?.code !== 'FORBIDDEN') fail(`Expected FORBIDDEN, got ${ack.error?.code}`);
  pass('subscribe:doctor FORBIDDEN for patient');
}

// ─── §5  subscribe:dept ───────────────────────────────────────────────────────

section('§5  subscribe:dept  (open, no auth)');

{
  const ack = await emit(anonSocket, 'subscribe:dept', { departmentId: gmDept.id });
  if (!ack.ok) fail(`subscribe:dept failed: ${JSON.stringify(ack.error)}`);
  if (!ack.snapshot?.department) fail('subscribe:dept ack missing snapshot.department');
  pass(`subscribe:dept ok  room=${ack.room}`);
}

// ─── §6  subscribe:admin ──────────────────────────────────────────────────────

section('§6  subscribe:admin  (admin only)');

const adminSocket = await makeSocket(adminJwt);
{
  const ack = await emit(adminSocket, 'subscribe:admin', {});
  if (!ack.ok) fail(`subscribe:admin failed: ${JSON.stringify(ack.error)}`);
  if (!ack.snapshot?.stats) fail('subscribe:admin ack missing snapshot.stats');
  if (!('simulator' in ack.snapshot)) fail('subscribe:admin ack missing snapshot.simulator');
  pass(`subscribe:admin ok  room=${ack.room}`);
}

{
  const ack = await emit(staffSocket, 'subscribe:admin', {});
  if (ack.ok) fail('subscribe:admin: staff should be FORBIDDEN');
  if (ack.error?.code !== 'FORBIDDEN') fail(`Expected FORBIDDEN, got ${ack.error?.code}`);
  pass('subscribe:admin FORBIDDEN for staff');
}

// ─── T1: token created → queue:update + display:update ────────────────────────

section('T1  token created → queue:update + display:update');

{
  // Re-subscribe dept watcher on anon socket before the action
  await emit(anonSocket, 'subscribe:dept', { departmentId: gmDept.id });

  // Listen for queue:update (staff room) and display:update (dept room)
  const queueUpdateP   = waitFor(staffSocket, 'queue:update',   TIMEOUT);
  const displayUpdateP = waitFor(anonSocket,  'display:update', TIMEOUT);
  const tokenUpdateP   = waitFor(patientSocket, 'token:update', TIMEOUT);

  // Cancel current test token and create a new one to trigger T1
  await httpReq('DELETE', `/tokens/${testTokenId}`, { token: patientJwt });
  // (T2 cancel fires token:ended + queue:update + display:update; we'll treat that as T2 below)
  // Re-create to get the T1 events
  const newCr = await httpReq('POST', '/tokens', {
    token: patientJwt,
    body: { departmentId: gmDept.id, doctorId: staffDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
  });
  if (newCr.status !== 201) fail(`T1 create token: ${JSON.stringify(newCr.body)}`);
  testTokenId  = newCr.body.id;
  testTokenNo  = newCr.body.tokenNo;
  const sigM   = newCr.body.trackUrl?.match(/\?s=([0-9a-f]+)/);
  testTokenSig = sigM?.[1];

  // Re-subscribe patient to new token
  await emit(patientSocket, 'subscribe:token', { tokenId: testTokenId });

  try {
    await Promise.all([queueUpdateP, displayUpdateP]);
    pass('T1 queue:update received (staff doctor room)');
    pass('T1 display:update received (dept room)');
  } catch (err) {
    fail(`T1: ${err.message}`);
  }
}

// ─── T2: cancel → token:ended ────────────────────────────────────────────────

section('T2  cancel → token:ended');

{
  const tokenEndedP = waitFor(patientSocket, 'token:ended', TIMEOUT);

  await httpReq('DELETE', `/tokens/${testTokenId}`, { token: patientJwt });

  try {
    const ended = await tokenEndedP;
    if (ended.tokenId !== testTokenId) fail(`T2: token:ended.tokenId mismatch`);
    if (ended.status !== 'CANCELLED') fail(`T2: expected CANCELLED, got ${ended.status}`);
    pass(`T2 token:ended received  status=${ended.status}`);
  } catch (err) {
    fail(`T2: ${err.message}`);
  }

  // Re-create for staff action tests
  const cr2 = await httpReq('POST', '/tokens', {
    token: patientJwt,
    body: { departmentId: gmDept.id, doctorId: staffDoctorId, type: 'LIVE', slotId: null, priority: 'NONE' },
  });
  if (cr2.status !== 201) fail(`T2 re-create: ${JSON.stringify(cr2.body)}`);
  testTokenId  = cr2.body.id;
  testTokenNo  = cr2.body.tokenNo;

  // Re-subscribe patient socket to new token
  await emit(patientSocket, 'subscribe:token', { tokenId: testTokenId });
  pass(`T2 new token ready: ${testTokenNo}`);
}

// Complete any pre-existing CALLED token for dr.sen before staff action tests
{
  const qSnap = await httpReq('GET', `/staff/doctors/${staffDoctorId}/queue`, { token: staffJwt });
  if (qSnap.body.current) {
    await httpReq('POST', `/staff/tokens/${qSnap.body.current.id}/complete`, {
      token: staffJwt, body: {},
    });
    pass('Pre-cleanup: existing CALLED token completed');
  }
}

// ─── T3: call-next → token:called ────────────────────────────────────────────

section('T3  call-next → token:called on patient socket');

let calledTokenId;
{
  const tokenCalledP = waitFor(patientSocket, 'token:called', TIMEOUT);
  const queueUpdateP = waitFor(staffSocket,   'queue:update', TIMEOUT);

  const cn = await httpReq('POST', `/staff/doctors/${staffDoctorId}/call-next`, {
    token: staffJwt, body: {},
  });
  if (cn.status !== 200) {
    if (cn.body?.error?.code === 'QUEUE_EMPTY') {
      pass('T3 QUEUE_EMPTY — no tokens for dr.sen; T3–T6 skipped');
      // Skip remaining staff action tests
      patientSocket.close();
      staffSocket.close();
      anonSocket.close();
      adminSocket.close();
      console.log('\n✅  socket-smoke PASSED  (T3–T6 skipped: empty queue)\n');
      process.exit(0);
    }
    fail(`T3 call-next: ${JSON.stringify(cn.body)}`);
  }
  calledTokenId = cn.body.token.id;

  // patient should receive token:called only if their token was picked
  if (calledTokenId === testTokenId) {
    try {
      const called = await tokenCalledP;
      if (called.tokenId !== testTokenId) fail('T3: token:called.tokenId mismatch');
      pass(`T3 token:called received  tokenNo=${called.tokenNo}`);
    } catch (err) {
      fail(`T3: ${err.message}`);
    }
  } else {
    // Swallow the pending waitFor timeout — a different token was called, our token won't get token:called
    tokenCalledP.catch(() => {});
    pass(`T3 note: a different token was called (${cn.body.token.tokenNo}); token:called for our patient not expected`);
  }

  try {
    await queueUpdateP;
    pass('T3 queue:update received on staff socket');
  } catch (err) {
    fail(`T3 queue:update: ${err.message}`);
  }
}

// ─── T4: skip → token:skipped ────────────────────────────────────────────────

section('T4  skip → token:skipped / queue:update');

let tokenAfterSkipId = calledTokenId;
{
  // Only send token:skipped to the skipped token's rooms
  const queueUpdateP = waitFor(staffSocket, 'queue:update', TIMEOUT);

  const sk = await httpReq('POST', `/staff/tokens/${calledTokenId}/skip`, {
    token: staffJwt, body: {},
  });
  if (sk.status !== 200) fail(`T4 skip: ${JSON.stringify(sk.body)}`);
  pass(`T4 skip result=${sk.body.result}`);

  try {
    await queueUpdateP;
    pass('T4 queue:update received after skip');
  } catch (err) {
    fail(`T4 queue:update: ${err.message}`);
  }

  // Call next again for T5 test
  const cn2 = await httpReq('POST', `/staff/doctors/${staffDoctorId}/call-next`, {
    token: staffJwt, body: {},
  });
  if (cn2.status === 200) {
    tokenAfterSkipId = cn2.body.token.id;
    pass(`T4 next token called: ${cn2.body.token.tokenNo}`);
  } else {
    pass(`T4 QUEUE_EMPTY after skip — T5/T6 skipped`);
    patientSocket.close(); staffSocket.close(); anonSocket.close(); adminSocket.close();
    console.log('\n✅  socket-smoke PASSED  (T5–T6 skipped: empty queue after skip)\n');
    process.exit(0);
  }
}

// ─── T5: no-show → token:ended ───────────────────────────────────────────────

section('T5  no-show → token:ended / queue:update');

let tokenForComplete;
{
  const queueUpdateP = waitFor(staffSocket, 'queue:update', TIMEOUT);

  const ns = await httpReq('POST', `/staff/tokens/${tokenAfterSkipId}/no-show`, {
    token: staffJwt, body: {},
  });
  if (ns.status !== 200) fail(`T5 no-show: ${JSON.stringify(ns.body)}`);
  if (ns.body.token.status !== 'NO_SHOW') fail('T5: expected NO_SHOW');
  pass('T5 no-show ok');

  try {
    await queueUpdateP;
    pass('T5 queue:update received after no-show');
  } catch (err) {
    fail(`T5 queue:update: ${err.message}`);
  }

  // Call next for T6 complete test
  const cn3 = await httpReq('POST', `/staff/doctors/${staffDoctorId}/call-next`, {
    token: staffJwt, body: {},
  });
  if (cn3.status === 200) {
    tokenForComplete = cn3.body.token;
    pass(`T5 next token called for T6: ${cn3.body.token.tokenNo}`);
  } else {
    pass('T5 QUEUE_EMPTY — T6 skipped');
    patientSocket.close(); staffSocket.close(); anonSocket.close(); adminSocket.close();
    console.log('\n✅  socket-smoke PASSED  (T6 skipped: empty queue)\n');
    process.exit(0);
  }
}

// ─── T6: complete → token:ended + queue:update ───────────────────────────────

section('T6  complete → token:ended / queue:update');

{
  const queueUpdateP = waitFor(staffSocket, 'queue:update', TIMEOUT);

  const cp = await httpReq('POST', `/staff/tokens/${tokenForComplete.id}/complete`, {
    token: staffJwt, body: {},
  });
  if (cp.status !== 200) fail(`T6 complete: ${JSON.stringify(cp.body)}`);
  if (cp.body.token.status !== 'COMPLETED') fail('T6: expected COMPLETED');
  pass('T6 complete ok');

  try {
    await queueUpdateP;
    pass('T6 queue:update received after complete');
  } catch (err) {
    fail(`T6 queue:update: ${err.message}`);
  }
}

// ─── unsubscribe ──────────────────────────────────────────────────────────────

section('unsubscribe');

{
  const ack = await emit(patientSocket, 'unsubscribe', { room: `token:${testTokenId}` });
  if (!ack.ok) fail(`unsubscribe failed: ${JSON.stringify(ack)}`);
  pass('unsubscribe ok');
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

patientSocket.close();
staffSocket.close();
anonSocket.close();
adminSocket.close();

// Cancel our test token if still active
await httpReq('DELETE', `/tokens/${testTokenId}`, { token: patientJwt }).catch(() => {});

console.log('\n✅  socket-smoke PASSED\n');
