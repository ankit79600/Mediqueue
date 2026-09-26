# MediQueue — Implementation Plan for Claude Code (VS Code)

> **This is the one file you follow.** The 6 spec files in `docs/` are reference material for Claude Code, not for you.
> Workflow: put this file + the 6 specs in `docs/` → paste the **MASTER PROMPT** (last section) into Claude Code → type `Start Phase 1` → review → `Continue to Phase 2` → …

---

## 0. Before Phase 1 (you, 10 minutes)

| Step | Action |
|---|---|
| 1 | Install **Node 20 LTS**, **Git**, **VS Code**, the **Claude Code** extension |
| 2 | Database: install **Docker Desktop** (local Postgres). No Docker? Create a free **Neon** project and use its connection string as `DATABASE_URL` from day one. |
| 3 | Create folder `mediqueue/`, open it in VS Code |
| 4 | Create `mediqueue/docs/` and copy in: `IMPLEMENTATION_PLAN.md` (this file), `API_CONTRACT.md`, `SOCKET_CONTRACT.md`, `DATABASE_SCHEMA.md`, `FINAL_PROJECT_STRUCTURE.md`, `MVP_CHECKLIST.md`, `TEAM_TASKS.md` |
| 5 | Open Claude Code, paste the MASTER PROMPT, then type `Start Phase 1` |

### Plan-level adjustments (these override the spec files where they differ)

| # | Adjustment | Reason |
|---|---|---|
| A1 | Build is **sequential** (backend first, then frontend). Skip `src/mocks/` and `VITE_USE_MOCKS`. | Claude Code builds one phase at a time |
| A2 | **Bonuses deferred:** kiosk (E15 + `/kiosk` page), priority boost + priority UI, ML (`ml/`, `etaSource` is always `"AVG"`), real Twilio (`SMS_MODE=simulated` only) | MVP first |
| A3 | `priority` column/field stays in DB & API; UI always sends `NONE`; no sort boost yet | Keeps contract stable for later bonus |
| A4 | Libraries: Express **5**, `bcryptjs`, Tailwind **v4** (`@tailwindcss/vite`), `sonner` toasts, Web Audio beep for the chime (no mp3 file) | Fewer install/build problems, Windows-friendly |
| A5 | Seed: all priorities `NONE`; in addition to 40 WAITING tokens, seed ~20 COMPLETED tokens earlier today | Admin averages not empty in demo |
| A6 | Dev networking: Vite proxy → `VITE_API_URL=/api/v1`, `VITE_SOCKET_URL=` (empty = same origin) | No CORS problems locally, phone-on-LAN works |
| A7 | Tests = runnable Node scripts in `apps/server/scripts/` (no Jest) | Fast, no config |
| A8 | Admin simulator/demo endpoints E23–E25 are built in **Phase 16**, not Phase 9 | They need the simulator |
| A9 | Simulator UI sends `arrivalsPerMin: 1`; engine pauses new arrivals while total WAITING ≥ 60 | Keeps demo queues realistic |
| A10 | Display board (`/display/:deptId`) is optional — build only after Phase 12 core is done | Not a mandatory requirement |
| A11 | Claude Code keeps `docs/PROGRESS.md` (phase log + deviations) | Lets any session resume |
| A12 | All npm scripts must be cross-platform (no `rm -rf`, no inline `VAR=x cmd`; use dotenv / Node scripts) | Works on Windows and macOS |

---

## PHASE 1 — Project initialization

| Item | Detail |
|---|---|
| **Build** | npm-workspaces monorepo, `@mediqueue/shared` constants package, env template, local Postgres, lint/format, git |
| **Why** | Every later phase imports enums, event names and error codes from one place — no string drift between server and web |
| **Dependencies** | root dev: `eslint @eslint/js globals prettier concurrently` |

**Files**
| Create | Notes |
|---|---|
| `package.json` | `"private": true`, `"type": "module"`, workspaces `["apps/*","packages/*","simulator"]`, `engines.node >=20`, scripts `lint`, `format`, `db:up`, `db:down` |
| `.gitignore`, `.nvmrc` (20), `.editorconfig`, `.prettierrc`, `eslint.config.js` | flat config, browser + node globals |
| `.env.example` | every var from FINAL_PROJECT_STRUCTURE §4 |
| `docker-compose.yml` | `postgres:16`, user/pass/db `mq/mq/mediqueue`, port 5432, named volume, healthcheck |
| `README.md` | title + "setup coming" |
| `packages/shared/package.json` | name `@mediqueue/shared`, `type: module`, `exports: "./index.js"` |
| `packages/shared/enums.js` | all enums, DATABASE_SCHEMA §2 |
| `packages/shared/events.js` | `C2S`, `S2C` event names (SOCKET_CONTRACT §3–4) + `rooms.token/tokenPublic/doctor/dept/admin` |
| `packages/shared/errors.js` | every code in API_CONTRACT §3 with its HTTP status |
| `packages/shared/index.js` | re-exports |
| `docs/PROGRESS.md` | phase log table |

**Works after:** `npm install` succeeds; shared package importable; Postgres running.

**Test**
```bash
npm install
node -e "import('@mediqueue/shared').then(m=>console.log(Object.keys(m)))"
npm run db:up && docker compose ps     # healthy
npm run lint
```
**Exit gate:** shared constants match the contracts 1:1 (Claude Code lists them in its report); first git commit made.

---

## PHASE 2 — Database and Prisma

| Item | Detail |
|---|---|
| **Build** | Prisma schema for all 10 tables + enums, migrations incl. raw-SQL partial unique indexes and CHECKs, idempotent seed |
| **Why** | The DB enforces the dangerous rules (one CALLED per doctor, one active token per patient/dept/day, slot capacity) |
| **Dependencies** | `apps/server`: `@prisma/client bcryptjs`; dev: `prisma` |

**Files**
| Create | Notes |
|---|---|
| `apps/server/package.json` | name `@mediqueue/server`, `type: module`, scripts `db:migrate`, `db:generate`, `db:seed`, `db:reset`, `prisma.seed` |
| `apps/server/.env` | from `.env.example` (gitignored) |
| `apps/server/prisma/schema.prisma` | DATABASE_SCHEMA §2–§3 exactly; snake_case via `@map/@@map`; `service_date` `@db.Date`; `sort_key` `BigInt` |
| `apps/server/prisma/migrations/*_init/` | generated |
| `apps/server/prisma/migrations/*_constraints/migration.sql` | `--create-only`, then add: `uq_one_called_per_doctor`, `uq_one_active_per_patient_dept_day`, the 3 CHECKs (DATABASE_SCHEMA §5) |
| `apps/server/prisma/seed.js` | DATABASE_SCHEMA §7 + adjustment A5; deletes then inserts (idempotent); sort_key per §4.2; counters consistent with token numbers |
| root `package.json` | add `db:migrate`, `db:seed` forwarding to server workspace |

**Works after:** DB has 4 depts, 6 doctors, 7 staff (6 STAFF + admin), slots for today+tomorrow, 40 WAITING + ~20 COMPLETED tokens.

**Test**
```bash
npm run db:migrate
npm run db:seed && npm run db:seed        # second run must also succeed
npx prisma studio --schema apps/server/prisma/schema.prisma
```
Plus a SQL check: set two tokens of the same doctor to `CALLED` → must fail on `uq_one_called_per_doctor`.

**Exit gate:** seed is idempotent; partial indexes exist (`\d tokens`); BigInt never needs to leave the server.

---

## PHASE 3 — Backend server

| Item | Detail |
|---|---|
| **Build** | Express 5 app on one HTTP server, config validation, error envelope, validation middleware, utilities, health endpoint, smoke-test runner |
| **Why** | Every endpoint after this reuses the same error format, auth hooks and validation |
| **Dependencies** | `express@5 cors helmet zod dotenv`; dev: `nodemon` |

**Files**
| Create | Notes |
|---|---|
| `apps/server/src/index.js` | create `http.Server`, attach app, listen on `PORT` (Socket.IO added in Phase 7) |
| `src/config.js` | zod-parsed env; crash with clear message if missing |
| `src/app.js` | helmet, cors(`CORS_ORIGIN`), json, `/api/v1` router, 404 → `NOT_FOUND`, error handler |
| `src/db.js` | Prisma singleton |
| `src/middleware/validate.js` | zod → `400 VALIDATION_ERROR` with `details.fields` |
| `src/middleware/error.js` | `AppError(code, message, details)`, uses `errors.js` status map; maps Prisma P2002 unique violations → 409 codes |
| `src/routes/health.routes.js` | E1 |
| `src/utils/time.js` | `serviceDate(date, HOSPITAL_TZ)` via `Intl.DateTimeFormat`, `minutesBetween` |
| `src/utils/mask.js` | `98XXXXXX10` |
| `src/utils/qr.js` | `sign(tokenId)` = first 16 hex of HMAC-SHA256(QR_SECRET), `verify`, `trackUrl(id)` |
| `apps/server/scripts/smoke.mjs` | ordered HTTP checks against `http://localhost:4000/api/v1`; each later phase appends a section; exits non-zero on failure |
| root `package.json` | `dev:server`, `smoke` |

**Works after:** `npm run dev:server` serves `/api/v1/health`.

**Test**
```bash
npm run dev:server
curl http://localhost:4000/api/v1/health       # {"status":"ok","db":"ok",...}
curl http://localhost:4000/api/v1/nope         # 404 {"error":{"code":"NOT_FOUND",...}}
npm run smoke
```
**Exit gate:** every error response uses the envelope; server refuses to start with a missing env var.

---

## PHASE 4 — Authentication

| Item | Detail |
|---|---|
| **Build** | Simulated OTP login, patient profile + consent, staff/admin login, JWT middleware, rate limits |
| **Why** | Mandatory requirement M1; every later endpoint depends on roles |
| **Dependencies** | `jsonwebtoken express-rate-limit` |

**Files**
| Create / modify | Notes |
|---|---|
| `src/services/otp.service.js` | 6-digit code, sha256(code+OTP_PEPPER), TTL 5 min, 5 attempts, 30 s resend, 5 per 10 min |
| `src/middleware/auth.js` | `optionalAuth`, `requirePatient`, `requireStaff`, `requireAdmin`, `requireKioskKey`; helper `assertCanActOnDoctor(user, doctorId)`; parse `X-Actor` (only with ADMIN JWT or valid kiosk key) → `req.actor` |
| `src/middleware/rateLimit.js` | OTP per-IP limiter; skipped for valid `X-Kiosk-Key` (simulator) |
| `src/services/presenter.js` | start with `patient()` (API §2.1) |
| `src/routes/auth.routes.js` | E2, E3, E4 (`devOtp` only if `DEMO_MODE=true`) |
| `src/routes/patient.routes.js` | E5, E6 |
| `scripts/smoke.mjs` | + auth section |

**Works after:** patient can log in with OTP and complete their profile; staff/admin can log in.

**Test (in smoke):** request OTP → wrong code (`OTP_INVALID`, attemptsLeft) → right code → `GET /patients/me` → `PUT` without consent (`CONSENT_REQUIRED`) → with consent (`profileComplete: true`) → resend within 30 s (`429`) → `dr.<name>/demo123` and `admin/admin123` login → wrong password (`401 INVALID_CREDENTIALS`).

**Exit gate:** MVP_CHECKLIST M1 backend criteria pass.

---

## PHASE 5 — Patient APIs

| Item | Detail |
|---|---|
| **Build** | Departments/slots catalog, ETA engine, Token presenter, token create/cancel (first part of QueueService), token reads, public token + display endpoints |
| **Why** | Mandatory M2 (book/join + QR data) and the data for M3 (position/ETA) |
| **Dependencies** | none |

**Files**
| Create / modify | Notes |
|---|---|
| `src/services/eta.service.js` | position, peopleAhead, remainingCurrent, estimatedWaitMin, estimatedCallAt (DATABASE_SCHEMA §4.3); `etaSource: "AVG"` |
| `src/services/presenter.js` | + `doctor`, `department`, `slot`, `token` (API §2.6), `tokenPublic` (§2.5) — exact field lists |
| `src/services/queue.service.js` | `withDoctorLock(doctorId, fn)` (`SELECT … FOR UPDATE`), `createToken` (auto-assign, counter upsert, slot capacity update, sort_key base, event CREATED), `cancelToken`; each returns `{ token, changes }` |
| `src/services/stats.service.js` | `displaySnapshot(deptId)` (API §2.8) — admin stats added in Phase 9 |
| `src/routes/catalog.routes.js` | E7, E8 |
| `src/routes/token.routes.js` | E9, E10, E11, E12 (E9 rejects `EMERGENCY`, `KIOSK`) |
| `src/routes/public.routes.js` | E13, E14 |
| `scripts/smoke.mjs` | + patient section (creates 4 test patients) |

**Works after:** a logged-in patient can list departments, join a queue or book a slot, get a token with `tokenNo`, `position`, `estimatedWaitMin`, `trackUrl`/`qrPayload`, and cancel it.

**Test (in smoke):** 4 departments with queue lengths → slots list → LIVE join (`GM-0xx`, position = waiting+1) → join same dept again (`409 ACTIVE_TOKEN_EXISTS`) → book one slot with 3 patients, 4th gets `409 SLOT_FULL` → cancel (`CANCELLED`, slot count released) → public token with good sig (200) / bad sig (403) → display snapshot.

**Exit gate:** Token JSON keys match API §2.6 exactly (smoke asserts the key list); M2 backend criteria pass.

---

## PHASE 6 — QueueService

| Item | Detail |
|---|---|
| **Build** | `callNext`, `skip`, `noShow`, `complete`; state machine; skip re-queue rule; second skip → NO_SHOW; doctor EWMA; `changes` object for emitters; `alerts: []` hook (filled in Phase 10) |
| **Why** | This is the core of the product and the most likely place for race-condition bugs |
| **Dependencies** | none |

**Files**
| Create / modify | Notes |
|---|---|
| `src/services/queue.service.js` | all mutations use `withDoctorLock`; illegal transitions → `409 INVALID_STATE`; `CONSULT_IN_PROGRESS`, `QUEUE_EMPTY`; queue_events for every action; `changes = { doctorIds, tokenIds, called, skipped, ended[], alerts[], notifications[] }` |
| `apps/server/scripts/queue-test.mjs` | calls the service directly on a fresh seed; asserts results; exits non-zero on failure |
| root `package.json` | `test:queue` |

**Works after:** the whole token lifecycle works at service level (no HTTP routes yet).

**Test**
```bash
npm run db:seed && npm run test:queue
```
Asserts: callNext picks the first in order · second callNext → `CONSULT_IN_PROGRESS` · complete → doctor avg changes · skip → token lands behind 3 people · skip again → `NO_SHOW` · noShow on WAITING → `INVALID_STATE` · empty queue → `QUEUE_EMPTY` · **`Promise.all` of 2 callNext → exactly one succeeds**.

**Exit gate:** all asserts pass twice in a row.

---

## PHASE 7 — Socket.IO realtime system

| Item | Detail |
|---|---|
| **Build** | Socket.IO on the same server, handshake JWT, subscribe handlers with ack snapshots, the single `emitters.flush(changes)`, 30 s ETA tick |
| **Why** | Mandatory M3 (live updates); foundation for M4–M6 |
| **Dependencies** | `socket.io`; dev: `socket.io-client` |

**Files**
| Create / modify | Notes |
|---|---|
| `src/realtime/io.js` | handshake `auth.accessToken` (bad → `connect_error "UNAUTHENTICATED"`), `socket.data.user`; handlers `subscribe:token`, `subscribe:tokenPublic`, `subscribe:doctor`, `subscribe:dept`, `unsubscribe` with authorization + ack `{ ok, room, snapshot }` (`subscribe:admin` added in Phase 9) |
| `src/realtime/emitters.js` | `flush(changes)` in SOCKET_CONTRACT §5 order; only file that emits |
| `src/services/presenter.js` | + `queueSnapshot(doctorId)` (API §2.7) |
| `src/index.js` | attach io; start ETA tick (`ETA_TICK_MS`, T7) |
| `src/routes/token.routes.js` | E9/E12 call `flush` after commit (T1, T2) |
| `scripts/socket-smoke.mjs` | socket.io-client checks |
| root `package.json` | `test:socket` |

**Works after:** clients subscribing to a token/doctor/department get live updates on token create/cancel and every 30 s.

**Test (`npm run test:socket`):** bad JWT → `connect_error` · patient subscribes to own token (snapshot) / another patient's token (`FORBIDDEN`) · public subscribe with bad sig (`INVALID_SIGNATURE`) · staff subscribed to doctor room receives `queue:update` when a patient joins · dept room receives `display:update` · cancel → `token:ended` + updates for tokens behind it.

**Exit gate:** T1, T2, T7 verified; no `io.emit`/`to()` outside `emitters.js` (grep).

---

## PHASE 8 — Staff APIs

| Item | Detail |
|---|---|
| **Build** | E16–E20 over QueueService, each followed by `flush` |
| **Why** | Mandatory M4 |
| **Dependencies** | none |

**Files**
| Create / modify | Notes |
|---|---|
| `src/routes/staff.routes.js` | E16 queue, E17 call-next, E18 skip (`result: REQUEUED|NO_SHOW`), E19 no-show, E20 complete; responses `{ token, queue }`; STAFF limited to own doctor, ADMIN any |
| `scripts/smoke.mjs` | + staff section |
| `scripts/socket-smoke.mjs` | + T3–T6 checks |

**Works after:** a staff member can run a whole OPD session over HTTP, and patients receive it live.

**Test:** smoke: call-next → complete → call-next → skip → call-next → no-show; STAFF of doctor X on doctor Y → `403`; double call-next → `409 CONSULT_IN_PROGRESS`. Socket: patient gets `token:called`, `token:skipped`, `token:ended`, position drops. Manual: SOCKET_CONTRACT §8 steps 1–4 with two terminals.

**Exit gate:** MVP_CHECKLIST M4 backend criteria pass.

---

## PHASE 9 — Admin APIs

| Item | Detail |
|---|---|
| **Build** | AdminStats (E21), notifications list (E22), admin socket room, throttled `stats:update` |
| **Why** | Mandatory M5 |
| **Dependencies** | none |

**Files**
| Create / modify | Notes |
|---|---|
| `src/services/stats.service.js` | `adminStats()` exactly per API §2.9 metric definitions |
| `src/routes/admin.routes.js` | E21, E22 (E23–E25 in Phase 16) |
| `src/realtime/io.js` | `subscribe:admin` → snapshot `{ stats, simulator: { running:false, … } }` |
| `src/realtime/emitters.js` | `stats:update` throttled 1000 ms trailing, sent from `flush` and the tick |
| `scripts/smoke.mjs`, `scripts/socket-smoke.mjs` | + admin sections |

**Works after:** admin gets live queue length, avg wait and load for each department.

**Test:** smoke compares E21 numbers to direct Prisma counts for one department · non-admin → `403` · socket: 10 fast token creations → ≤ 3 `stats:update` events, and the last one is correct.

**Exit gate:** MVP_CHECKLIST M5 backend criteria pass.

---

## PHASE 10 — Notification system

| Item | Detail |
|---|---|
| **Build** | 3-turns-away rule inside every queue transaction, notification rows (IN_APP + SMS_SIMULATED), `token:alert` + `notification:new` emits, messages for TOKEN_CREATED/CALLED/SKIPPED/NO_SHOW |
| **Why** | Mandatory M6 |
| **Dependencies** | none (Twilio deferred) |

**Files**
| Create / modify | Notes |
|---|---|
| `src/services/notification.service.js` | `renderMessage(kind, token)`, `record(tx, …)` (masked phone), console line `[SMS→98XXXXXX10] …` |
| `src/services/queue.service.js` | after each mutation, inside the tx: find WAITING tokens with position ≤ 3 and `notified_three_away=false` → set flag, NOTIFIED_THREE_AWAY event, notification rows → push to `changes.alerts/notifications` |
| `src/realtime/emitters.js` | `token:alert` (both token rooms), `notification:new` (admin) |
| `scripts/queue-test.mjs`, `scripts/socket-smoke.mjs` | + alert assertions |

**Works after:** patients get exactly one alert when 3 turns away; the admin sees a live simulated SMS log.

**Test:** token at position 6 → 3× call-next → one alert at position 3 · more calls → no second alert · skipped token that was already notified → no new alert · new token created at position ≤ 3 → alert fires immediately · E22 lists the rows.

**Exit gate:** MVP_CHECKLIST M6 backend criteria pass. **The backend is complete for M1–M6.**

---

## PHASE 11 — Frontend setup

| Item | Detail |
|---|---|
| **Build** | Vite React app, Tailwind v4, shadcn/ui, router with all MVP routes, API client, socket manager with polling fallback, notify helper, layouts |
| **Why** | Every screen uses the same API/socket/error plumbing |
| **Dependencies** | `react-router-dom socket.io-client qrcode.react recharts sonner lucide-react clsx tailwind-merge class-variance-authority`; dev: `tailwindcss @tailwindcss/vite vite-plugin-pwa`; shadcn components: `button card input label badge table dialog select checkbox tabs skeleton sonner alert` |

**Files**
| Create / modify | Notes |
|---|---|
| `apps/web/` | `npm create vite@latest apps/web -- --template react`; rename package to `@mediqueue/web` |
| `apps/web/vite.config.js` | react, tailwind, PWA (manifest name "MediQueue"), alias `@`, dev proxy `/api` + `/socket.io` (ws) → `:4000`, `server.host: true` |
| `apps/web/jsconfig.json`, `components.json` | shadcn in JS mode |
| `apps/web/.env` | `VITE_API_URL=/api/v1`, `VITE_SOCKET_URL=` |
| `src/lib/api.js` | fetch wrapper; Bearer; throws `ApiError{status, code, message, details}`; 401 → clear auth + redirect to the matching login |
| `src/lib/auth.js` | JWT + role in localStorage (try/catch), guards |
| `src/lib/socket.js` | one socket; `subscribe(event, payload) → Promise<snapshot>`; re-subscribe on reconnect; > 5 s disconnected → call the REST fallback every 10 s; exposes connection state |
| `src/lib/notify.js` | sonner toast, Notification API permission, `navigator.vibrate`, Web Audio beep |
| `src/components/ConnectionPill.jsx`, `StatusBadge.jsx`, `layouts/PatientLayout.jsx` (mobile), `layouts/OpsLayout.jsx` (desktop) | |
| `src/App.jsx` | routes from FINAL_PROJECT_STRUCTURE §3 except `/kiosk`; placeholder pages; `RequireRole` guard |
| `src/pages/Landing.jsx` | Patient / Staff / Admin links + ConnectionPill |
| root `package.json` | `dev` = concurrently server + web; `build:web` |

**Works after:** `npm run dev` opens the landing page; all routes render; the pill shows `Live`.

**Test:** `npm run dev` → http://localhost:5173 · stop the server → pill switches to `Polling`/`Offline` · restart → `Live` · open `http://<laptop-LAN-IP>:5173` on a phone · `npm run build:web` succeeds.

**Exit gate:** `api.js` and `socket.js` are the only files that touch fetch/socket.io directly.

---

## PHASE 12 — Patient UI

| Item | Detail |
|---|---|
| **Build** | Login → OTP → Profile/consent → Book (dept, optional doctor, Join now / Slot) → Token live page (QR, position, ETA, status, cancel, alerts) → My tokens → Public QR tracking page |
| **Why** | M1, M2, M3, M6 patient side — the part judges hold in their hands |
| **Dependencies** | none new |

**Files**
| Create | Notes |
|---|---|
| `src/pages/patient/Login.jsx`, `Otp.jsx` | show `devOtp` as "SMS simulated" toast; 30 s resend countdown; error codes → friendly text |
| `src/pages/patient/Profile.jsx` | name, age, gender, consent checkbox (required) |
| `src/pages/patient/Book.jsx` | dept cards (queue length + wait), "Any doctor" default, Join now, slot grid (disabled full/past), handles `ACTIVE_TOKEN_EXISTS` with link |
| `src/pages/patient/TokenLive.jsx` | big token number, QR (`qrPayload`), "You are Nth", people ahead, wait min, call time, status, cancel; asks Notification permission; 3-away banner (also derived from `notifiedThreeAway` on reload); full-screen called modal + beep |
| `src/pages/patient/MyTokens.jsx` | active + history |
| `src/pages/track/PublicTrack.jsx` | `/t/:id?s=`, TokenPublic only, same live updates/alerts |
| `src/hooks/useToken.js` | snapshot → `token:update` / `tokenPublic:update`, drops stale `updatedAt`, handles alert/called/skipped/ended events |
| `src/components/TokenCard.jsx`, `QrTicket.jsx` | |
| *(optional, only after the above)* `src/pages/display/DisplayBoard.jsx`, `src/hooks/useDisplay.js` | adjustment A10 |

**Works after:** the whole patient journey on a phone-size screen, live.

**Test:** Chrome DevTools 360 px + a real phone on LAN: MVP_CHECKLIST M1, M2, M3 test steps; for M6 run `curl` / a second tab calling call-next until the patient is 3rd → banner + vibration; scan the QR with a second phone.

**Exit gate:** M1, M2, M3 frontend criteria + M6 patient criteria pass.

---

## PHASE 13 — Staff UI

| Item | Detail |
|---|---|
| **Build** | Staff login, doctor picker (admin), staff panel with current patient, waiting list, 4 actions, counters, keyboard shortcuts |
| **Why** | M4 |
| **Dependencies** | none new |

**Files**
| Create | Notes |
|---|---|
| `src/pages/staff/StaffLogin.jsx` | STAFF → `/staff/doctors/:ownId`; ADMIN → picker |
| `src/pages/staff/StaffPanel.jsx` | current card (token no, name, age, called time), Call next / Complete / Skip / No-show (confirm dialog), counters, waiting table; buttons enabled only in valid states; 409s → toast; shortcuts N/C/S/X |
| `src/hooks/useDoctorQueue.js` | snapshot + `queue:update`; action responses replace state immediately |
| `src/components/QueueTable.jsx`, `StatCard.jsx` | |

**Works after:** a doctor runs their queue from the browser; patient phones update live.

**Test:** MVP_CHECKLIST M4 steps, including two tabs pressing Call next at the same moment (one success, one friendly 409).

**Exit gate:** M4 frontend criteria pass.

---

## PHASE 14 — Admin dashboard

| Item | Detail |
|---|---|
| **Build** | KPI row, per-department table/cards with overload highlight, 2 charts, live simulated-SMS log |
| **Why** | M5 + M6 proof |
| **Dependencies** | none new (recharts installed) |

**Files**
| Create | Notes |
|---|---|
| `src/pages/admin/AdminDashboard.jsx` | KPIs: waiting, in consultation, completed, avg wait · dept table: queue length, avg wait, in consult, completed, no-shows, active doctors, load/doctor (≥ 8 highlighted), longest wait · bar chart load per dept · hourly arrivals vs completed · link to each doctor panel |
| `src/pages/admin/SmsLog.jsx` | E22 + `notification:new` prepend |
| `src/hooks/useAdminStats.js` | `subscribe:admin` snapshot + `stats:update` |

**Works after:** admin sees the whole hospital moving live.

**Test:** MVP_CHECKLIST M5 steps; create tokens from a phone → numbers move without refresh; SMS log receives THREE_AWAY rows live.

**Exit gate:** M5 frontend criteria + M6 admin criteria pass.

---

## PHASE 15 — Backend/frontend integration

| Item | Detail |
|---|---|
| **Build** | Nothing new — hardening across the whole flow |
| **Why** | Contract mismatches and reconnect bugs only show up when everything runs together |
| **Dependencies** | none |

**Work list**
| Check | Fix if broken |
|---|---|
| REST and socket payloads for the same object are identical (Token, QueueSnapshot, AdminStats) | presenter reuse |
| Reconnect: kill server mid-queue, restart → every screen resumes the correct state | `socket.js` re-subscribe |
| Page refresh at any step keeps the user in the right place | auth + routing |
| Expired/invalid JWT → clean redirect to login | `api.js` / handshake |
| Loading skeletons, empty states, all error codes have friendly text | pages |
| Times shown in IST; token numbers reset per day | `time.js` |
| 360 px patient layout, 1366 px ops layout | CSS |
| No console errors or unhandled promise rejections | |

**Test:** 4 windows (patient phone, staff panel, admin, public QR page) → run SOCKET_CONTRACT §8 steps 1–6 → run `npm run smoke && npm run test:queue && npm run test:socket`.

**Exit gate:** full journey works 3 times in a row with no refresh and no console errors.

---

## PHASE 16 — 30+ patient simulator

| Item | Detail |
|---|---|
| **Build** | `simulator/` package (CLI + in-process engine) using only the REST API, admin endpoints E23–E25, admin toggle + demo reset in the UI, `demo:reset` handling |
| **Why** | Required demo: at least 3 departments with 30+ patients, moving live |
| **Dependencies** | none (Node 20 `fetch`, `node:util parseArgs`) |

**Files**
| Create / modify | Notes |
|---|---|
| `simulator/package.json` | `@mediqueue/simulator`, exports `engine.js`, bin script |
| `simulator/profiles.js` | dept weights (GM 40%, PED 25%, ORT 20%, GYN 15%), consult minutes per dept, 70% LIVE / 30% SLOT, action mix 85% complete / 10% skip / 5% no-show |
| `simulator/bots/patientBot.js` | unique phones `91000NNNNN`, OTP flow with `devOtp`, headers `X-Kiosk-Key` + `X-Actor: SIMULATOR`, profile, join |
| `simulator/bots/doctorBot.js` | admin login; loop per active doctor: call-next → wait sampled consult ÷ speed → action; handles `QUEUE_EMPTY` |
| `simulator/engine.js` | `startSimulation({ baseUrl, speed, arrivalsPerMin, patients })`, `stopSimulation()`, `status()`; pauses arrivals while total WAITING ≥ 60 (A9) |
| `simulator/index.js` | CLI `--speed --patients --base` |
| `apps/server/src/services/simulator.runner.js` | start/stop in-process, emits `simulator:status` |
| `apps/server/src/routes/admin.routes.js` | + E23, E24, E25 (E25 only with `DEMO_MODE`; stops simulator, resets today's data, re-seeds, emits `demo:reset`) |
| `apps/web/src/pages/admin/AdminDashboard.jsx` | Simulator start/stop (sends `arrivalsPerMin: 1`), speed select, Reset demo button |
| `apps/web/src/lib/socket.js` | `demo:reset` → clear state, re-subscribe, refetch |
| root `package.json` | `simulate` |

**Works after:** one click fills 4 departments with 30+ patients and doctors serve them at 10× speed.

**Test:** `npm run simulate -- --speed 10 --patients 40` → dashboard shows ≥ 3 departments, ≥ 30 patients, numbers moving, SMS log filling · toggle start/stop from the admin UI · Reset demo → back to 40 seeded, every open screen refreshes · run 10 minutes at 10× → no server errors.

**Exit gate:** demo requirement met from the admin UI alone.

---

## PHASE 17 — Testing all mandatory requirements

| Item | Detail |
|---|---|
| **Build** | Nothing new — verification and bug fixing |
| **Why** | Must-have completion is 30% of the judging score |
| **Dependencies** | none |

**Work list**
| Step | Action |
|---|---|
| 1 | `npm run db:seed && npm run smoke && npm run test:queue && npm run test:socket` → all green |
| 2 | Walk every checkbox in `docs/MVP_CHECKLIST.md` M1–M6 with a real phone + laptop; tick boxes as they pass (only checkbox edits allowed in that file) |
| 3 | Edge cases: expired OTP, 5 wrong OTPs, full slot, double call-next, skip twice, cancel then rejoin, server restart mid-queue, phone refresh just after the alert, 2 staff tabs |
| 4 | Simulator at 10× for 15 minutes while manually using a patient phone |
| 5 | Record in `docs/PROGRESS.md`: each M# → PASS/FAIL + notes; fix FAILs and re-test |

**Exit gate:** M1–M6 all PASS on localhost; test scripts green.

---

## PHASE 18 — Deployment

| Item | Detail |
|---|---|
| **Build** | Neon Postgres, Render server (WebSockets), Vercel web, production env |
| **Why** | Judges need a working link; the demo must not depend on one laptop |
| **Dependencies** | none |

**Files**
| Create / modify | Notes |
|---|---|
| `apps/server/package.json` | `start` = `prisma migrate deploy && node src/index.js` |
| `render.yaml` (root) | web service: build `npm ci && npm run db:generate -w @mediqueue/server`, start `npm run start -w @mediqueue/server`, health check `/api/v1/health` |
| `apps/web/vercel.json` | SPA rewrite `/(.*)` → `/index.html` |
| `.env.example` | production notes |
| `README.md` | setup, env, scripts, deployed URLs, demo logins |

**Steps**
| # | Action |
|---|---|
| 1 | Neon: create DB, copy URL with `?sslmode=require` |
| 2 | Render: new Web Service from GitHub repo, env vars (`DATABASE_URL`, `JWT_SECRET`, `OTP_PEPPER`, `QR_SECRET`, `KIOSK_KEY`, `DEMO_MODE=true`, `SMS_MODE=simulated`, `HOSPITAL_TZ`, `PUBLIC_WEB_URL`, `CORS_ORIGIN`, `SIMULATOR_BASE_URL=https://<render>/api/v1`) |
| 3 | Seed once from your laptop: set `DATABASE_URL` to Neon in `apps/server/.env` temporarily → `npm run db:seed` → restore |
| 4 | Vercel: import repo, root `apps/web`, framework Vite, env `VITE_API_URL=https://<render>/api/v1`, `VITE_SOCKET_URL=https://<render>`. If `@mediqueue/shared` fails to resolve, set Install Command `npm ci --prefix ../..` |
| 5 | Update Render `PUBLIC_WEB_URL` + `CORS_ORIGIN` to the Vercel URL → redeploy |

**Test:** real phone on **mobile data**: M1–M6 on the deployed URLs · QR scan opens the Vercel `/t/...` page · simulator from the deployed admin · open `/api/v1/health` 5 minutes before judging (Render free tier sleeps).

**Exit gate:** M1–M6 PASS on production. MVP done → bonuses can start.

---

## MASTER PROMPT FOR CLAUDE CODE

Copy everything inside the box into Claude Code once, at the start. Then type `Start Phase 1`. After each phase report, type `Continue to Phase N`.

````text
You are the senior engineer building MediQueue for the CodeVoyage Hackathon (problem HT-01: Smart OPD Queue & Appointment System). I am the CTO. We build in 18 sequential phases. You work on ONE phase at a time, test it, report, and STOP.

## 1. What we are building
A real-time digital OPD queue for government/district hospitals:
- Patients log in with mobile + simulated OTP, join a live queue or book a slot for a department/doctor, get a token with a QR code, and watch their live position and estimated wait.
- Staff/doctors run their queue: call next, skip, mark no-show, mark complete.
- Admin sees live queue length, average wait and patient load per department.
- Patients get an alert when they are 3 turns away.
- A simulator drives 4 departments with 30+ patients for the demo.

## 2. Mandatory requirements (the ONLY features in scope)
M1 Patient registration via mobile number + OTP (simulated OTP shown as a toast via `devOtp`).
M2 Book a slot or join a live queue for a department/doctor; digital token with QR code.
M3 Live queue position + estimated wait, updated in real time (Socket.IO, REST polling fallback).
M4 Staff panel: call next, skip, no-show, complete.
M5 Admin dashboard: queue length, average wait, patient load per department.
M6 Notification when the patient is 3 turns away (in-app + simulated SMS log).
Demo: at least 3 departments, 30+ patients.

NOT in scope now (do not build, do not scaffold UI for): kiosk mode (E15, /kiosk), priority boost or priority UI (keep the `priority` field, UI always sends NONE, no sort boost), ML wait prediction (`etaSource` is always "AVG", no ml/ folder), real Twilio (SMS_MODE=simulated only), multi-hospital, payments, medical records, native apps, i18n.

## 3. Tech stack (frozen)
- Monorepo with npm workspaces: apps/server, apps/web, packages/shared, simulator. JavaScript ESM, Node 20. No TypeScript.
- Backend: Express 5 + Socket.IO on the same HTTP server, zod validation, JWT (jsonwebtoken), bcryptjs, express-rate-limit, helmet, cors, dotenv.
- Database: PostgreSQL 16 via Prisma. Local Postgres via docker-compose (or a Neon URL).
- Frontend: React 18 + Vite, Tailwind v4 (@tailwindcss/vite), shadcn/ui (JS mode), react-router-dom, socket.io-client, qrcode.react, recharts, sonner, lucide-react, vite-plugin-pwa.
- Deploy: Vercel (web), Render (server), Neon (DB).
Do not add any other dependency without asking me first and giving the reason.

## 4. Sources of truth (read before coding each phase)
All in /docs:
- docs/IMPLEMENTATION_PLAN.md: the phases, the exact files per phase, the tests, and the exit gates. Its "Plan-level adjustments" table OVERRIDES the other docs where they differ.
- docs/API_CONTRACT.md: every REST endpoint (E1–E25), request/response shapes, error envelope and codes. Implement EXACTLY: same URLs, field names, status codes, error codes.
- docs/SOCKET_CONTRACT.md: rooms, subscribe events with ack snapshots, server events, the emission order (§5), the 3-away rule (§5.1), client rules (§6).
- docs/DATABASE_SCHEMA.md: tables, columns, enums, indexes, partial unique indexes, state machine (§4.1), sort_key rules (§4.2), ETA formulas (§4.3), concurrency (§6), seed (§7).
- docs/FINAL_PROJECT_STRUCTURE.md: folder layout, routes, env vars, conventions.
- docs/MVP_CHECKLIST.md: acceptance criteria for M1–M6.
Only read the sections relevant to the current phase. If two docs conflict, IMPLEMENTATION_PLAN adjustments win, then API_CONTRACT/SOCKET_CONTRACT, then the rest.
If a contract is impossible or clearly wrong, STOP, explain the blocker, and propose the smallest contract change. Do not silently deviate.

## 5. Architecture rules (never break)
1. Only apps/server/src/services/queue.service.js changes tokens.status or tokens.sort_key. Every queue mutation runs in ONE Prisma interactive transaction that starts with `SELECT … FROM doctors WHERE id=$1 FOR UPDATE`.
2. Only apps/server/src/realtime/emitters.js emits Socket.IO events, only AFTER the transaction commits, via flush(changes), in the SOCKET_CONTRACT §5 order.
3. REST responses and socket payloads are built by the same presenter functions (presenter.js / stats.service.js), so the shapes are identical.
4. Clients never compute queue positions; the server is the only source of truth.
5. Event names, room names, enums and error codes are imported from @mediqueue/shared, never hard-coded strings.
6. Frontend: only src/lib/api.js does fetch; only src/lib/socket.js touches socket.io-client.
7. Every error response uses {"error":{"code","message","details?"}}.
8. Public endpoints and the public socket room never expose names or phone numbers. Phones are masked everywhere except the owner's own profile.
9. Secrets only in .env files (gitignored); keep .env.example updated.

## 6. How to work each phase
When I say "Start Phase N" or "Continue to Phase N":
1. INSPECT: run `git status`, list the repo tree (skip node_modules), read docs/PROGRESS.md, and read the phase N section of docs/IMPLEMENTATION_PLAN.md plus only the contract sections it references. Check that the previous phase's exit gate is met; if it isn't, tell me and fix that first.
2. PLAN: before editing, show a short table of the files you will create or modify, and the dependencies you will install. Only files listed for this phase, or files that phase clearly requires.
3. IMPLEMENT: complete, working code, with no placeholder TODOs that break runtime. Keep functions small and readable, with comments only where the logic is non-obvious (locks, sort_key, ETA, 3-away rule).
4. TEST: run every test listed for the phase (smoke scripts, test:queue, test:socket, curl, build). Start the server or dev processes yourself when needed, and stop them afterwards. If a test fails, fix it and re-run until it passes. Never claim a test passed without running it.
5. REPORT: reply with
   - Phase N — DONE / BLOCKED
   - Files created/modified (table)
   - Dependencies installed
   - Test commands run + results
   - How I can verify it manually (max 5 steps)
   - Any deviation from the docs, and why
6. LOG + COMMIT: append a row to docs/PROGRESS.md (phase, date, status, notes, deviations), then `git add -A && git commit -m "phase-N: <summary>"`.
7. STOP. Do not start the next phase until I say so.

## 7. Scope and safety rules
- Do not modify files outside the current phase's scope. If you must touch another file (e.g. to add a route to app.js or a script to the root package.json), keep the edit minimal and list it in the report.
- Never rewrite or reformat working code from earlier phases unless it is a bug fix required now; name the bug in the report.
- Do not edit the spec docs in /docs. Exceptions: tick checkboxes in docs/MVP_CHECKLIST.md during Phase 17, and update docs/PROGRESS.md every phase.
- Do not delete files, rename folders, or change the folder structure unless the plan says to.
- No new dependencies, frameworks, state libraries, ORMs or test frameworks beyond section 3 without my approval.
- Scripts must be cross-platform (Windows + macOS): no rm -rf, no inline `VAR=value cmd`.
- Never commit .env files, node_modules or secrets.

## 8. The project must stay runnable
After every phase, all of these must still work (as far as they exist by then):
- `npm install` at the root
- `npm run db:migrate` and `npm run db:seed` (the seed is idempotent)
- `npm run dev:server` (Phase 3+) / `npm run dev` (Phase 11+) start without errors
- `npm run smoke` (Phase 3+), `npm run test:queue` (Phase 6+), `npm run test:socket` (Phase 7+) pass
- `npm run build:web` (Phase 11+) succeeds
If a phase breaks an earlier test, fix it before reporting DONE.

## 9. Testing conventions
- apps/server/scripts/smoke.mjs: ordered HTTP checks against http://localhost:4000/api/v1. Append a section each phase. Assert status codes, error codes and exact object key lists from API_CONTRACT §2. Exit non-zero on the first failure, with a clear message.
- apps/server/scripts/queue-test.mjs: calls queue.service directly on a freshly seeded DB, including a Promise.all concurrency test on call-next.
- apps/server/scripts/socket-smoke.mjs: socket.io-client checks for handshake, authorization, ack snapshots and every emission trigger T1–T7.
- Frontend phases: run the build, start dev, and give me exact manual test steps (including a 360 px mobile viewport and a phone on the LAN via the Vite host URL).

## 10. Communication
- Be concise. Use tables for plans and reports.
- If something is ambiguous and not answered by the docs, pick the simplest option consistent with the contracts, state it in the report, and log it in PROGRESS.md. Ask me only for real blockers.

Acknowledge with a 5-line summary of the project and the phase list, then wait for "Start Phase 1".
````

**After the master prompt, you only need these messages:**
| Situation | Type into Claude Code |
|---|---|
| Begin | `Start Phase 1` |
| Phase report looks good | `Continue to Phase <N+1>` |
| Something broke | `Phase <N> issue: <what you saw>. Fix it within Phase <N> scope, re-run the phase tests, report.` |
| New chat/session | Paste the master prompt again, then `Read docs/PROGRESS.md and continue from the next phase.` |
| After Phase 18 | Ask me (CTO) for the bonus-phase plan |
