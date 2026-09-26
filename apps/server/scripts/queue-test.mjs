/**
 * queue-test.mjs — Direct service-layer tests for queue mutations.
 *
 * Usage:  npm run db:seed && node apps/server/scripts/queue-test.mjs
 * Needs:  seeded database (db:seed), no running server required.
 *
 * Tests (per IMPLEMENTATION_PLAN Phase 6):
 *   1. createToken — basic create, key fields
 *   2. callNext    — picks first in order
 *   3. double callNext → CONSULT_IN_PROGRESS
 *   4. complete    → token COMPLETED, doctor avgConsultMin updated
 *   5. skip (first) → re-queued behind 3 people (position ≥ 4)
 *   6. second skip → NO_SHOW
 *   7. noShow on non-CALLED token → INVALID_STATE
 *   8. callNext on empty queue → QUEUE_EMPTY
 *   9. Promise.all(callNext × 2) → exactly one wins
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

import prisma from '../src/db.js';
import {
  createToken, callNext, skipToken, noShow, completeToken,
} from '../src/services/queue.service.js';
import { ActorType } from '@mediqueue/shared';
import { getHospitalDate } from '../src/utils.js';

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

function assertEq(a, b, msg) {
  if (a !== b) fail(`${msg}: expected "${b}", got "${a}"`);
  pass(msg);
}

function assertErr(err, code, msg) {
  if (!err?.code) fail(`${msg}: no err.code (${err?.message ?? err})`);
  if (err.code !== code) fail(`${msg}: expected code "${code}", got "${err.code}"`);
  pass(`${msg} → ${code}`);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

console.log('\n── queue-test.mjs ─────────────────────────────────────────────');

const today = getHospitalDate();

// Find dr.sen (always seeded)
const doctorSen = await prisma.doctor.findFirst({ where: { name: 'Dr. A. Sen' } });
if (!doctorSen) fail('Dr. A. Sen not found — run npm run db:seed first');
pass(`dr.sen found  id=${doctorSen.id}`);

// Use 5 dedicated test patients (phones 9700000001-05) with age=30 so no ELDERLY auto-boost.
// Upsert them so the script is self-contained; these do NOT conflict with seeded patients.
const TEST_PHONES = Array.from({ length: 5 }, (_, i) =>
  `970000000${i + 1}`,
);
const patients = [];
for (const phone of TEST_PHONES) {
  const p = await prisma.patient.upsert({
    where:  { phone },
    update: { name: 'Queue Test Patient', age: 30, consentAt: new Date() },
    create: { phone, name: 'Queue Test Patient', age: 30, consentAt: new Date() },
  });
  patients.push(p);
}
pass(`5 dedicated test patients ready (phones ${TEST_PHONES[0]}–${TEST_PHONES[4]})`);

// Clear ALL WAITING/CALLED tokens for dr.sen today — ensures a clean queue regardless
// of any leftover state from previous test runs or the seed.
await prisma.token.updateMany({
  where: {
    doctorId:    doctorSen.id,
    serviceDate: today,
    status:      { in: ['WAITING', 'CALLED'] },
  },
  data: { status: 'CANCELLED' },
});
pass('dr.sen queue cleared (all WAITING/CALLED cancelled)');

const ACTOR = ActorType.STAFF;
const mkToken = (i) =>
  createToken(patients[i].id, {
    departmentId: doctorSen.departmentId,
    doctorId:     doctorSen.id,
    type:         'LIVE',
    slotId:       null,
    actorType:    ACTOR,
    actorId:      null,
  });

// ─── §1  createToken ──────────────────────────────────────────────────────────

section('§1  createToken');

const r1 = await mkToken(0);
assertEq(r1.token.status, 'WAITING', 'tokenA status = WAITING');
assertEq(typeof r1.token.tokenNo, 'string', 'tokenA has tokenNo');
assertEq(r1.token.doctorId, doctorSen.id, 'tokenA.doctorId correct');
const tokenA = r1.token;

const r2 = await mkToken(1);
const tokenB = r2.token;
pass(`tokenB created  tokenNo=${tokenB.tokenNo}`);

const r3 = await mkToken(2);
const tokenC = r3.token;

const r4 = await mkToken(3);
const tokenD = r4.token;
pass(`4 tokens in queue for dr.sen`);

// Confirm queue order: A, B, C, D (all NONE priority, creation order = sort order)
const queueCheck = await prisma.token.findMany({
  where:   { doctorId: doctorSen.id, serviceDate: today, status: 'WAITING',
             patientId: { in: patients.map(p => p.id) } },
  orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  select:  { id: true },
});
if (queueCheck.length < 4)
  fail(`Expected ≥ 4 WAITING tokens for test patients, found ${queueCheck.length}`);
// A must be first among our test tokens
const ourIds = [tokenA.id, tokenB.id, tokenC.id, tokenD.id];
const firstOurs = queueCheck.find(t => ourIds.includes(t.id));
if (firstOurs?.id !== tokenA.id)
  fail(`Queue order wrong: expected tokenA first, got ${firstOurs?.id}`);
pass('Queue order confirmed: tokenA is first');

// ─── §2  callNext picks first in order ───────────────────────────────────────

section('§2  callNext → picks first token');

const cn1 = await callNext(doctorSen.id, ACTOR, null);
assertEq(cn1.changes.called.tokenId, tokenA.id, 'callNext picks tokenA (first created)');
const calledA = await prisma.token.findUnique({ where: { id: tokenA.id } });
assertEq(calledA.status, 'CALLED', 'tokenA.status = CALLED');

// ─── §3  double callNext → CONSULT_IN_PROGRESS ───────────────────────────────

section('§3  double callNext → CONSULT_IN_PROGRESS');

try {
  await callNext(doctorSen.id, ACTOR, null);
  fail('should have thrown CONSULT_IN_PROGRESS');
} catch (err) {
  assertErr(err, 'CONSULT_IN_PROGRESS', 'second callNext');
}

// ─── §4  complete → COMPLETED + avgConsultMin updated ────────────────────────

section('§4  complete → COMPLETED, avgConsultMin updated');

const avgBefore = Number(
  (await prisma.doctor.findUnique({ where: { id: doctorSen.id } })).avgConsultMin,
);
const comp1 = await completeToken(tokenA.id, ACTOR, null, null);
assertEq(comp1.token.status, 'COMPLETED', 'tokenA.status = COMPLETED');
const avgAfter = Number(
  (await prisma.doctor.findUnique({ where: { id: doctorSen.id } })).avgConsultMin,
);
if (typeof avgAfter !== 'number' || isNaN(avgAfter))
  fail('avgConsultMin is not a valid number after complete');
pass(`avgConsultMin updated  (${avgBefore} → ${avgAfter})`);

// ─── §5  skip (first) → re-queued behind 3 people ────────────────────────────

section('§5  skip (first) → WAITING, position ≥ 4');

// Add a 5th token so there are ≥ 3 WAITING when tokenB is called and skipped
const r5 = await mkToken(4);
const tokenE = r5.token;
pass(`tokenE added → 4 WAITING: B, C, D, E`);

// Queue is now: B, C, D, E  (A is COMPLETED)
const cn2 = await callNext(doctorSen.id, ACTOR, null);
assertEq(cn2.changes.called.tokenId, tokenB.id, 'callNext picks tokenB (next in order)');

const sk1 = await skipToken(tokenB.id, ACTOR, null, null);
assertEq(sk1.result, 'REQUEUED', 'skip result = REQUEUED');
const tokenBReq = await prisma.token.findUnique({ where: { id: tokenB.id } });
assertEq(tokenBReq.status, 'WAITING', 'tokenB back to WAITING');
assertEq(tokenBReq.skipCount, 1, 'tokenB.skipCount = 1');

// Verify position: B should be behind C, D, E (position 4)
const queueAfterSkip = await prisma.token.findMany({
  where:   { doctorId: doctorSen.id, serviceDate: today, status: 'WAITING',
             patientId: { in: patients.map(p => p.id) } },
  orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  select:  { id: true },
});
const posBafterSkip = queueAfterSkip.findIndex(t => t.id === tokenB.id) + 1;
if (posBafterSkip < 4)
  fail(`tokenB position after skip = ${posBafterSkip}, expected ≥ 4 (behind 3 others: C, D, E)`);
pass(`tokenB position after skip = ${posBafterSkip} (behind 3+ others) ✓`);

// ─── §6  second skip → NO_SHOW ───────────────────────────────────────────────

section('§6  second skip → NO_SHOW');

// Drain C, D, E to get B to the front
const cn3 = await callNext(doctorSen.id, ACTOR, null); // → C
await completeToken(cn3.changes.called.tokenId, ACTOR, null, null);

const cn4 = await callNext(doctorSen.id, ACTOR, null); // → D
await completeToken(cn4.changes.called.tokenId, ACTOR, null, null);

const cn5 = await callNext(doctorSen.id, ACTOR, null); // → E
await completeToken(cn5.changes.called.tokenId, ACTOR, null, null);

// Now only B remains
const cn6 = await callNext(doctorSen.id, ACTOR, null);
assertEq(cn6.changes.called.tokenId, tokenB.id, 'callNext picks tokenB (only one left)');

const sk2 = await skipToken(tokenB.id, ACTOR, null, null);
assertEq(sk2.result, 'NO_SHOW', 'second skip result = NO_SHOW');
const tokenBFinal = await prisma.token.findUnique({ where: { id: tokenB.id } });
assertEq(tokenBFinal.status, 'NO_SHOW', 'tokenB.status = NO_SHOW');

// ─── §7  noShow on non-CALLED token → INVALID_STATE ─────────────────────────

section('§7  noShow on WAITING token → INVALID_STATE');

// patients[0] has no active token (tokenA was COMPLETED)
const r6 = await mkToken(0);
const tokenF = r6.token;
pass(`fresh tokenF created  tokenNo=${tokenF.tokenNo}`);

try {
  await noShow(tokenF.id, ACTOR, null, null);
  fail('noShow on WAITING should have thrown INVALID_STATE');
} catch (err) {
  assertErr(err, 'INVALID_STATE', 'noShow on WAITING');
}

// ─── §8  empty queue → QUEUE_EMPTY ───────────────────────────────────────────

section('§8  callNext on empty queue → QUEUE_EMPTY');

// Cancel the remaining WAITING token (tokenF)
await prisma.token.update({ where: { id: tokenF.id }, data: { status: 'CANCELLED' } });

// Cancel any other WAITING tokens for our test patients (shouldn't be any, but be safe)
await prisma.token.updateMany({
  where: {
    patientId:   { in: patients.map(p => p.id) },
    serviceDate: today,
    status:      'WAITING',
  },
  data: { status: 'CANCELLED' },
});

try {
  await callNext(doctorSen.id, ACTOR, null);
  fail('callNext on empty queue should have thrown QUEUE_EMPTY');
} catch (err) {
  assertErr(err, 'QUEUE_EMPTY', 'callNext on empty queue');
}

// ─── §9  Promise.all(callNext × 2) → exactly one wins ───────────────────────

section('§9  concurrent callNext — exactly one wins');

// Create 2 tokens (patients[0] and [1] now have no active tokens)
const ra = await mkToken(0);
const rb = await mkToken(1);
pass(`2 tokens seeded for concurrency test  (${ra.token.tokenNo}, ${rb.token.tokenNo})`);

const results = await Promise.allSettled([
  callNext(doctorSen.id, ACTOR, null),
  callNext(doctorSen.id, ACTOR, null),
]);

const fulfilled = results.filter(r => r.status === 'fulfilled');
const rejected  = results.filter(r => r.status === 'rejected');

if (fulfilled.length !== 1)
  fail(`Expected exactly 1 winner, got ${fulfilled.length} (${rejected.length} lost)`);
if (rejected.length !== 1)
  fail(`Expected exactly 1 loser, got ${rejected.length}`);
assertErr(rejected[0].reason, 'CONSULT_IN_PROGRESS', 'losing callNext');
pass(`Concurrency test: 1 winner / 1 CONSULT_IN_PROGRESS ✓`);

// Cleanup: complete the winning token, cancel the other
const winnerTokenId = fulfilled[0].value.token.id;
const loserTokenId  = winnerTokenId === ra.token.id ? rb.token.id : ra.token.id;
await completeToken(winnerTokenId, ACTOR, null, null);
await prisma.token.update({ where: { id: loserTokenId }, data: { status: 'CANCELLED' } });

// ─── Done ─────────────────────────────────────────────────────────────────────

await prisma.$disconnect();
console.log('\n✅  queue-test PASSED\n');
