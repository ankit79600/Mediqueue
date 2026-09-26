# MediQueue — Phase Progress Log

| Phase | Date | Status | Notes | Deviations |
|---|---|---|---|---|
| 1 — Project init | 2026-09 | DONE | Monorepo, `@mediqueue/shared`, `.env.example`, `docker-compose.yml` | None |
| 2 — Database & Prisma | 2026-09 | DONE | Schema, migrations, idempotent seed (40 WAITING + ~20 COMPLETED) | Seed includes COMPLETED tokens so admin averages are non-zero (A5) |
| 3 — Backend server | 2026-09 | DONE | Express app, `config.js`, `utils.js`, health E1 | Test script `scripts/smoke.mjs` not yet created — pending |
| 4 — Authentication | 2026-09 | DONE | E2–E4 OTP flow (simulated), E5–E6 patient profile; bcryptjs; JWT HS256 | OTP is always simulated (`SMS_MODE=simulated`); Twilio not wired (A2) |
| 5 — Patient APIs | 2026-09 | DONE | E7–E8 catalog, E9–E12 token CRUD, E13–E14 public (with sig) | E14 display snapshot shares `buildDisplaySnapshotForDept` with Socket.IO |
| 6 — QueueService | 2026-09 | DONE | `queue.service.js`: createToken, callNext, skipToken, noShow, completeToken; `SELECT … FOR UPDATE` doctor-row lock; sort_key BigInt; 3-away rule | Test script `scripts/queue-test.mjs` not yet created — pending |
| 7 — Socket.IO realtime | 2026-09 | DONE | `io.js`, `emitters.js` (flush, etaTick, scheduleStatsUpdate), `handlers.js` (subscribe/unsubscribe with ack); SOCKET_CONTRACT §5 emission order | Test script `scripts/socket-smoke.mjs` not yet created — pending |
| 8 — Staff APIs | 2026-09 | DONE | E16–E20; each route calls queue mutation + `flush(io, changes)` | None |
| 9 — Admin APIs | 2026-09 | DONE | E21 stats, E22 notifications | None |
| 10 — Notification system | 2026-09 | DONE | `notification.service.js`: notifMessage, insertNotifications, checkThreeAway, getNotifications, dispatchSms | dispatchSms is a no-op stub (SMS_MODE=simulated); tokenNo was null in `notification:new` — fixed in A11 session (re-fetch with token include) |
| 16 — Simulator | 2026-09 | DONE | E23–E25; `simulator.service.js` (in-process); `demo.service.js` (reset + re-seed); `DEMO_MODE` guard on E25 | Built in Phase 16 order as per A8 deviation; `arrivalsPerMin` pause-at-60 logic (A9) included |
| A11 — Bug fixes & logs | 2026-09-26 | DONE | Try/catch on all 5 async socket subscribe handlers; merged duplicate `@mediqueue/shared` import in `admin.routes.js`; E14 shares `buildDisplaySnapshotForDept` (no inline duplicate); single request logger in `app.js`; `docs/PROGRESS.md` created | Phases 11–15 (frontend) intentionally deferred; test scripts (smoke, queue-test, socket-smoke) not yet created |

## Mandatory requirement status (M1–M6)

To be filled in Phase 17 after full integration test.

| Req | Description | Status |
|---|---|---|
| M1 | Patient joins queue from phone | PENDING |
| M2 | Doctor calls next, patient gets alert | PENDING |
| M3 | Queue display updates live | PENDING |
| M4 | Admin sees live stats | PENDING |
| M5 | 30+ patients, 3+ departments, simulator | PENDING |
| M6 | Works on LAN (phone + laptop same WiFi) | PENDING |

## Known blockers / remaining work

- `apps/server/scripts/smoke.mjs`, `queue-test.mjs`, `socket-smoke.mjs` — not created; required by Phases 3/6/7 exit gates and Phase 17 test step
- Phases 11–15 (frontend UI) — not started
- Phase 17 M1–M6 walkthrough — not started
- Phase 18 deployment — not started
