# TEAM_TASKS.md — 4-person parallel plan

> Timeline written for a **24-hour** build (H0 = kickoff). For 36 h, multiply every hour mark by 1.5.
> Rule: frontend never waits on backend — B and C build against `src/mocks/` (fixtures that match the contracts exactly) until checkpoint CP1.
> Contracts are frozen. Any change → edit the contract doc first → all 4 approve the PR.

## 1. Roles

| Member | Role | Owns (folders) | Primary requirements |
|---|---|---|---|
| **A** | Backend lead | `apps/server/src/**`, `prisma/schema.prisma`, migrations | M1–M6 server side, queue engine, sockets |
| **B** | Patient-side frontend | `apps/web/src/pages/patient`, `track`, `kiosk`, `display`, `lib/*`, `hooks/useToken.js`, `hooks/useDisplay.js`, `mocks/` | M1, M2, M3, M6 (patient UI) |
| **C** | Ops frontend | `apps/web/src/pages/staff`, `admin`, `hooks/useDoctorQueue.js`, `hooks/useAdminStats.js`, shared `components/` | M4, M5, M6 (SMS log) |
| **D** | Platform, data, demo, ML | repo root, `packages/shared`, `prisma/seed.js`, `simulator/`, `ml/`, `docs/`, deployment | Demo (3 depts, 30+ patients), submission |

---

## 2. Checkpoints (whole team, 10 min each)

| CP | Hour | Gate — must be true to pass |
|---|---|---|
| CP0 | H2 | Repo boots (`npm run dev`), Postgres up, schema migrated + seeded, `packages/shared` merged, mocks load in web |
| CP1 | H8 | Real backend: OTP login → join queue → token page shows position; staff "Call next" updates patient live. Mocks switched off. |
| CP2 | H14 | **M1–M6 all working on localhost** against real backend |
| CP3 | H17 | Deployed (Vercel + Render + Neon); M1–M6 pass on deployed URLs; simulator runs 3+ depts, 30+ patients |
| CP4 | H20 | **Code freeze for features.** Only bug fixes, polish, docs after this |
| CP5 | H22 | Demo video recorded, deck done, README + checklist complete |
| — | H24 | Submit |

Bonus work (priority, kiosk, ML ETA) is allowed **only** for a member whose CP2 items are done, and must stop at CP4.

---

## 3. Task lists

### Member A — Backend

| ID | Task | Hours | Depends on | Output / done when |
|---|---|---|---|---|
| A1 | Prisma schema exactly per DATABASE_SCHEMA; migration incl. raw-SQL partial indexes + CHECKs | H0–H1.5 | D1 | `prisma migrate dev` clean; D can seed |
| A2 | Express skeleton: config, error envelope, zod validate, auth middleware (patient/staff/admin/kiosk), `/health` | H1–H2.5 | D2 | E1 live; error format per API §3 |
| A3 | OTP + auth: E2, E3, E4, E5, E6 (hash, TTL, attempts, rate limit, devOtp) | H2.5–H4.5 | A2 | M1 backend boxes ticked |
| A4 | `queue.service.js`: create (counter, auto-assign, slot capacity, sort_key, priority), cancel, callNext, skip, noShow, complete — each in one tx with doctor row lock; returns `changes` | H4.5–H8 | A1 | Unit-ish script: 2 parallel callNext → one 409 |
| A5 | `eta.service.js` + `presenter.js` (Token, TokenPublic, QueueSnapshot, qr sig) | H5–H7 | A1 | Positions/ETAs match DATABASE_SCHEMA §4.3 |
| A6 | Routes E7–E14, E16–E20 | H6–H9 | A4, A5 | All return contract shapes |
| A7 | Socket.IO: handshake auth, subscribe handlers with ack snapshots, `emitters.flush()` in §5 order, stats throttle, ETA tick (T7) | H7–H10 | A5 | SOCKET_CONTRACT §8 test passes |
| A8 | `notification.service.js`: 3-away rule inside tx, notifications rows, SMS simulated (Twilio flag stub) | H9–H11 | A4, A7 | M6 backend boxes ticked |
| A9 | `stats.service.js`: E21 AdminStats, DisplaySnapshot, E22 | H10–H12 | A5 | M5 numbers correct vs manual SQL |
| A10 | E23–E25 simulator + demo reset endpoints (wrap D's engine) | H12–H13 | D6 | Admin toggle works |
| A11 | Bug-fix support for B/C integration; logs | H13–H17 | — | CP2, CP3 |
| A12 | (bonus) load `model.json` in eta.service → `etaSource: MODEL` | after CP2 | D8 | Falls back to AVG if file missing |

### Member B — Patient frontend

| ID | Task | Hours | Depends on | Output / done when |
|---|---|---|---|---|
| B1 | Vite + Tailwind + shadcn + router + PWA manifest; `lib/api.js`, `lib/auth.js` | H0–H2 | D2 | Routes from STRUCTURE §3 render placeholders |
| B2 | `mocks/fixtures.js` + `mocks/mockSocket.js` for **every** contract object and event (shared with C) | H1–H3 | contracts | `VITE_USE_MOCKS=true` drives all pages |
| B3 | `lib/socket.js`: single socket, `subscribe()` → snapshot, auto re-subscribe, 5 s → polling fallback, `ConnectionPill` | H3–H6 | B2 | Works with mockSocket and real server |
| B4 | Login + OTP + Profile/consent pages (M1) | H2–H5 | B1 | M1 frontend boxes |
| B5 | Book page: dept list, doctor picker, Join now, slot grid, error handling (M2) | H5–H8 | B1 | M2 frontend boxes |
| B6 | Token live page: QR (`qrcode.react`), position, ETA, status, cancel; `useToken` (M2, M3) | H6–H10 | B3 | M3 frontend boxes |
| B7 | `lib/notify.js`: permission prompt, toast, vibrate, chime; 3-away banner + full-screen called modal (M6) | H10–H12 | B6 | M6 patient boxes |
| B8 | Public track page `/t/:id` + My tokens page | H11–H13 | B6 | QR scan works on 2nd phone |
| B9 | Display board `/display/:deptId` (`useDisplay`) | H13–H15 | B3 | Used in demo layout |
| B10 | Mobile polish (360 px), empty/error states, Hindi/English labels only if time | H15–H20 | — | UX pass |
| B11 | (bonus) Kiosk page + print ticket view | after CP2 | E15 | `window.print()` ticket |

### Member C — Ops frontend

| ID | Task | Hours | Depends on | Output / done when |
|---|---|---|---|---|
| C1 | Shared components: `StatCard`, `QueueTable`, `StatusBadge`, `PriorityBadge`, `TokenCard`, layout shell | H0–H3 | B1 | Storybook-free: demo page `/dev/components` |
| C2 | Staff login page + role guard (E4) | H2–H4 | B1 | STAFF → own doctor, ADMIN → doctor picker |
| C3 | Staff panel: current card, waiting list, 4 actions with 409 handling, today counters; `useDoctorQueue` (M4) | H4–H10 | B2, B3 | M4 frontend boxes (on mocks by H8, real by H10) |
| C4 | Keyboard shortcuts on staff panel (N = next, C = complete, S = skip, X = no-show) + confirm on no-show | H10–H11 | C3 | Fast live demo |
| C5 | Admin dashboard: KPI row, per-dept table/cards, highlight overload, 2 Recharts charts; `useAdminStats` (M5) | H8–H14 | B3 | M5 frontend boxes |
| C6 | SMS log page `/admin/sms` (E22 + `notification:new`) (M6) | H14–H15 | C5 | Live rows appear |
| C7 | Admin simulator toggle + demo reset button (E23–E25, `simulator:status`) | H15–H16 | A10 | Toggle drives demo |
| C8 | Desktop polish (1366 px), loading/error states, landing page | H16–H20 | — | UX pass |

### Member D — Platform, data, demo, ML

| ID | Task | Hours | Depends on | Output / done when |
|---|---|---|---|---|
| D1 | Monorepo scaffold: workspaces, docker-compose Postgres, `.env.example`, ESLint/Prettier, root scripts | H0–H1 | — | Everyone clones and runs |
| D2 | `packages/shared`: enums, events + room builders, error codes (copy from contracts) | H0.5–H1.5 | contracts | Imported by web + server |
| D3 | `prisma/seed.js` per DATABASE_SCHEMA §7 (4 depts, 6 doctors, staff, slots, 40 patients/tokens) | H1.5–H3 | A1 | `npm run db:seed` idempotent |
| D4 | Deploy pipeline early: Neon DB, Render server (migrate on start), Vercel web, env vars | H3–H5 | A2 | "Hello" deploy works at H5 |
| D5 | Contract smoke test script (`docs/smoke.http` or node script) hitting E1–E25 happy paths | H5–H7 | A6 | Run before every merge to main |
| D6 | `simulator/engine.js` + bots + profiles; CLI + export for server | H6–H11 | E2/E3/E9/E15–E20 contracts | 3+ depts, 30+ patients moving at 10× |
| D7 | `ml/generate_history.py` synthetic 30 days | H11–H12 | — | `history.csv` |
| D8 | (bonus) `ml/train.py` → `model.json`; `evaluate.ipynb` MAE model vs naive | H12–H14 | D7 | Chart for deck |
| D9 | CP3 deploy + env verification on real URLs; wake-up routine | H14–H17 | all | CP3 |
| D10 | docs: README, PRIVACY.md, REQUIREMENT_CHECKLIST.md, architecture.png | H15–H19 | — | Submission docs |
| D11 | DEMO_SCRIPT.md, record 2–3 min video, 8-slide deck | H19–H22 | CP4 | CP5 |

---

## 4. Dependency map (critical path)

```
D1 → D2 ─┬─> A1 → A4 → A6 → A7 → A8 → CP2
         │         └─> A5 ─┘
         └─> B1 → B2 → B3 → B6 → B7
                     └──> C3, C5 (on mocks) ── switch to real at CP1
A1 → D3 (seed)      A2 → D4 (early deploy)      contracts → D6 (simulator) → A10 → C7
```
**Critical path = A4 → A7 → A8.** If A slips > 1 h, D takes A9 (stats) and A10.

---

## 5. Parallel work rules

| Rule | Detail |
|---|---|
| Mocks first | B2 publishes fixtures by H3; C uses the same fixtures. Fixture = contract example, byte-for-byte. |
| Integration switch | At CP1 set `VITE_USE_MOCKS=false`; any mismatch → fix code, not contract (unless blocker). |
| Branches | `a/A4-queue-service`, `b/B6-token-page`, … ; PR to `main`, 1 reviewer, D5 smoke test green. |
| File ownership | Only the owner edits their folders; shared `components/` owned by C, `lib/` by B — others request changes. |
| Merges | Small PRs, merge at least every 2 h; `main` always deployable after CP3. |
| Stand-ups | 5 min at every checkpoint: done / next / blocked. |
| Blocker protocol | Stuck > 30 min → ask in team chat; > 60 min → CTO call to cut or reassign. |
| Scope guard | Nothing outside MVP_CHECKLIST before CP2. Bonuses only after CP2, stop at CP4. |

---

## 6. Demo-day responsibilities

| Member | During live demo |
|---|---|
| A | Runs staff panel (keyboard shortcuts), watches server logs |
| B | Holds patient phone (live position, 3-away alert, QR scan) |
| C | Drives admin dashboard + simulator toggle, shows SMS log |
| D | Presents slides, narrates, backup video ready, answers architecture/privacy/ML questions |
