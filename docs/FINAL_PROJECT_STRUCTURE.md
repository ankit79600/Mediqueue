# FINAL_PROJECT_STRUCTURE.md — MediQueue (CodeVoyage HT-01)

> **Status: FROZEN.** Architecture changes require a real technical blocker + agreement of all 4 members.
> Single sources of truth: `API_CONTRACT.md` and `SOCKET_CONTRACT.md`.

---

## 1. Frozen decisions

| # | Decision | Value |
|---|---|---|
| D1 | Repo layout | One monorepo, npm workspaces |
| D2 | Language | JavaScript (ESM), Node 20 LTS. No TypeScript (speed). |
| D3 | Frontend | React 18 + Vite + Tailwind + shadcn/ui, **one** SPA, installable PWA |
| D4 | Backend | Node.js + Express + Socket.IO on the **same** HTTP server/port |
| D5 | Database | PostgreSQL 16 via Prisma ORM |
| D6 | Validation | `zod` on every request body/query |
| D7 | Auth | JWT (HS256). Patients: simulated OTP. Staff/Admin: username + password (seeded) |
| D8 | Queue writes | **Only** `queue.service.js` may change `tokens.status` / `tokens.sort_key` |
| D9 | Socket emits | **Only** `realtime/emitters.js` may call `io.emit/to()` |
| D10 | Shared constants | `packages/shared` — enums, event names, room names, error codes. Imported by web, server, simulator. |
| D11 | ML | Offline Python → `ml/model.json`. Server applies it in JS. No Python at runtime. |
| D12 | Simulator | `simulator/` package that talks to the **REST API only**. Runs as CLI or in-process (admin toggle). |
| D13 | SMS | Simulated by default (`SMS_MODE=simulated`). Twilio only behind flag. |
| D14 | Timezone | All timestamps UTC in DB/API. `service_date` computed in `HOSPITAL_TZ=Asia/Kolkata`. |
| D15 | Deploy | Web → Vercel. Server → Render (WebSockets). DB → Neon/Supabase Postgres. Local → docker-compose Postgres. |

---

## 2. Repository tree

```
mediqueue/
├── package.json                    # workspaces: apps/*, packages/*, simulator
├── docker-compose.yml              # postgres:16 (local dev only)
├── .env.example                    # every env var listed in §4
├── .eslintrc.cjs / .prettierrc
├── README.md                       # setup, features, stack, team, credits (submission requirement)
│
├── packages/
│   └── shared/                     # @mediqueue/shared — NO runtime deps
│       ├── package.json
│       ├── enums.js                # TokenStatus, TokenType, Priority, Role, Gender, QueueAction, ActorType, Notification*
│       ├── events.js               # SOCKET event names + room name builders (SOCKET_CONTRACT §2–§4)
│       ├── errors.js               # error codes (API_CONTRACT §3)
│       └── index.js
│
├── apps/
│   ├── server/                     # @mediqueue/server
│   │   ├── package.json
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # mirrors DATABASE_SCHEMA.md exactly
│   │   │   ├── migrations/         # incl. raw-SQL partial indexes (DATABASE_SCHEMA §5)
│   │   │   └── seed.js             # 4 depts, 6 doctors, slots, staff, 40 demo patients
│   │   └── src/
│   │       ├── index.js            # create http server, attach express + socket.io, start ETA tick
│   │       ├── config.js           # env parsing + defaults (zod)
│   │       ├── app.js              # express app, cors, json, routes, error handler
│   │       ├── db.js               # Prisma client singleton
│   │       ├── middleware/
│   │       │   ├── auth.js         # requirePatient, requireStaff, requireAdmin, requireKioskKey, optionalAuth
│   │       │   ├── validate.js     # zod wrapper → 400 VALIDATION_ERROR
│   │       │   ├── rateLimit.js    # OTP + kiosk limits
│   │       │   └── error.js        # AppError → error envelope
│   │       ├── routes/
│   │       │   ├── health.routes.js
│   │       │   ├── auth.routes.js
│   │       │   ├── patient.routes.js
│   │       │   ├── catalog.routes.js       # /departments, /doctors/:id/slots
│   │       │   ├── token.routes.js
│   │       │   ├── public.routes.js        # /public/tokens/:id, /public/display/:deptId
│   │       │   ├── kiosk.routes.js
│   │       │   ├── staff.routes.js
│   │       │   └── admin.routes.js
│   │       ├── services/
│   │       │   ├── queue.service.js        # create/cancel/callNext/skip/noShow/complete — transactions + locks
│   │       │   ├── eta.service.js          # position, peopleAhead, ETA; loads model.json if present
│   │       │   ├── notification.service.js # 3-away rule, SMS simulated/Twilio, notifications table
│   │       │   ├── otp.service.js
│   │       │   ├── stats.service.js        # AdminStats + DisplaySnapshot builders
│   │       │   ├── presenter.js            # DB rows → Token / TokenPublic / QueueSnapshot objects
│   │       │   └── simulator.runner.js     # start/stop @mediqueue/simulator in-process
│   │       ├── realtime/
│   │       │   ├── io.js                   # handshake auth, subscribe/unsubscribe handlers + acks
│   │       │   └── emitters.js             # ALL emits; stats throttle (1 s)
│   │       └── utils/
│   │           ├── qr.js                   # HMAC sign/verify for track URL
│   │           ├── time.js                 # serviceDate(), minutesBetween()
│   │           └── mask.js                 # phone masking 98XXXXXX21
│   │
│   └── web/                        # @mediqueue/web
│       ├── package.json
│       ├── index.html
│       ├── vite.config.js          # PWA plugin, proxy /api + /socket.io → server in dev
│       ├── public/
│       │   ├── manifest.webmanifest
│       │   ├── icons/
│       │   └── sounds/chime.mp3
│       └── src/
│           ├── main.jsx
│           ├── App.jsx                     # routes (§3)
│           ├── lib/
│           │   ├── api.js                  # fetch wrapper: base URL, JWT header, error envelope → throw
│           │   ├── socket.js               # ONE socket; subscribe(room)→snapshot; reconnect; polling fallback
│           │   ├── auth.js                 # JWT store (localStorage, try/catch), role guards
│           │   └── notify.js               # toast + Notification API + navigator.vibrate + chime
│           ├── hooks/
│           │   ├── useToken.js             # REST + token room
│           │   ├── useDoctorQueue.js       # REST + doctor room
│           │   ├── useDisplay.js           # REST + dept room
│           │   └── useAdminStats.js        # REST + admin room
│           ├── mocks/                      # contract fixtures; enabled by VITE_USE_MOCKS=true
│           │   ├── fixtures.js
│           │   └── mockSocket.js
│           ├── components/
│           │   ├── ui/                     # shadcn generated
│           │   ├── TokenCard.jsx
│           │   ├── QrTicket.jsx            # qrcode.react
│           │   ├── QueueTable.jsx
│           │   ├── StatCard.jsx
│           │   ├── PriorityBadge.jsx
│           │   ├── StatusBadge.jsx
│           │   └── ConnectionPill.jsx      # live / polling / offline indicator
│           └── pages/
│               ├── patient/  Login.jsx, Otp.jsx, Profile.jsx, Book.jsx, TokenLive.jsx, MyTokens.jsx
│               ├── track/    PublicTrack.jsx           # QR target, no login
│               ├── staff/    StaffLogin.jsx, StaffPanel.jsx
│               ├── admin/    AdminDashboard.jsx, SmsLog.jsx
│               ├── kiosk/    Kiosk.jsx, KioskTicket.jsx # print view
│               └── display/  DisplayBoard.jsx          # TV screen per department
│
├── ml/                             # offline only (bonus)
│   ├── requirements.txt            # pandas, numpy, scikit-learn
│   ├── generate_history.py         # synthetic 30 days of consultations → data/history.csv
│   ├── train.py                    # LinearRegression → model.json (coefficients + feature list)
│   ├── evaluate.ipynb              # MAE model vs naive average (deck slide)
│   ├── data/                       # gitignored except sample.csv
│   └── model.json                  # committed; read by server via ML_MODEL_PATH
│
├── simulator/                      # @mediqueue/simulator
│   ├── package.json
│   ├── index.js                    # CLI: node simulator --speed 10 --patients 40 --base http://localhost:4000
│   ├── engine.js                   # startSimulation(opts) / stopSimulation() / status()
│   ├── bots/
│   │   ├── patientBot.js           # joins via OTP flow (DEMO_MODE devOtp) or kiosk endpoint
│   │   └── doctorBot.js            # logs in as admin, loops call-next → complete/skip/no-show
│   └── profiles.js                 # arrival rate, priority mix, consult-time distribution per dept
│
└── docs/
    ├── FINAL_PROJECT_STRUCTURE.md
    ├── DATABASE_SCHEMA.md
    ├── API_CONTRACT.md
    ├── SOCKET_CONTRACT.md
    ├── MVP_CHECKLIST.md
    ├── TEAM_TASKS.md
    ├── REQUIREMENT_CHECKLIST.md    # submission: every must-have + bonus → Done/Partial/Not done
    ├── PRIVACY.md                  # consent, synthetic data, masking, JWT, no medical data
    ├── DEMO_SCRIPT.md              # 2:45 video script + live-demo runbook
    └── architecture.png            # for deck
```

---

## 3. Frontend routes (single SPA)

| Route | Page | Auth | Device |
|---|---|---|---|
| `/` | Landing → choose Patient / Staff / Admin / Kiosk / Display | none | any |
| `/patient/login` | Phone entry | none | phone |
| `/patient/otp` | OTP entry | none | phone |
| `/patient/profile` | Name, age, gender, consent | patient | phone |
| `/patient/book` | Dept → doctor (optional) → Join now / Slot | patient | phone |
| `/patient/tokens` | My tokens today | patient | phone |
| `/patient/tokens/:tokenId` | Live token: QR, position, ETA, alerts | patient | phone |
| `/t/:tokenId?s=<sig>` | Public tracking (QR target) | signature | any phone |
| `/staff/login` | Staff/admin login | none | desktop |
| `/staff/doctors/:doctorId` | Staff panel | staff/admin | desktop/tablet |
| `/admin` | Admin dashboard | admin | desktop |
| `/admin/sms` | Simulated SMS log | admin | desktop |
| `/kiosk` | Walk-in kiosk | kiosk key (env) | kiosk |
| `/display/:deptId` | TV display board | none | TV |

---

## 4. Environment variables

| Var | Used by | Example | Notes |
|---|---|---|---|
| `DATABASE_URL` | server | `postgresql://mq:mq@localhost:5432/mediqueue` | |
| `PORT` | server | `4000` | |
| `JWT_SECRET` | server | long random | |
| `JWT_TTL_PATIENT` | server | `12h` | |
| `JWT_TTL_STAFF` | server | `12h` | |
| `OTP_PEPPER` | server | long random | hashed OTPs |
| `QR_SECRET` | server | long random | track-URL HMAC |
| `KIOSK_KEY` | server, web | `kiosk-demo-key` | header `X-Kiosk-Key` |
| `DEMO_MODE` | server | `true` | returns `devOtp`, enables `/admin/demo/reset` |
| `SMS_MODE` | server | `simulated` \| `twilio` | |
| `TWILIO_SID` / `TWILIO_TOKEN` / `TWILIO_FROM` | server | | only if `SMS_MODE=twilio` |
| `HOSPITAL_TZ` | server | `Asia/Kolkata` | |
| `PUBLIC_WEB_URL` | server | `https://mediqueue.vercel.app` | builds `trackUrl` |
| `CORS_ORIGIN` | server | same as web URL | |
| `ML_MODEL_PATH` | server | `../../ml/model.json` | missing file → avg-based ETA |
| `ETA_TICK_MS` | server | `30000` | |
| `SIMULATOR_BASE_URL` | server, simulator | `http://localhost:4000/api/v1` | |
| `VITE_API_URL` | web | `https://mediqueue-api.onrender.com/api/v1` | |
| `VITE_SOCKET_URL` | web | `https://mediqueue-api.onrender.com` | |
| `VITE_USE_MOCKS` | web | `false` | `true` until backend is ready |
| `VITE_KIOSK_KEY` | web | `kiosk-demo-key` | kiosk build only |

---

## 5. Root scripts

| Script | Does |
|---|---|
| `npm run db:up` | `docker compose up -d postgres` |
| `npm run db:migrate` | `prisma migrate dev` (server) |
| `npm run db:seed` | run `prisma/seed.js` |
| `npm run dev` | server (nodemon) + web (vite) concurrently |
| `npm run dev:mock` | web only, `VITE_USE_MOCKS=true` |
| `npm run simulate` | simulator CLI against `SIMULATOR_BASE_URL` |
| `npm run ml:train` | `python ml/generate_history.py && python ml/train.py` |
| `npm run lint` / `npm run format` | ESLint / Prettier |

---

## 6. Conventions

| Topic | Rule |
|---|---|
| API JSON | camelCase fields |
| DB | snake_case tables/columns (Prisma `@map` / `@@map`) |
| IDs | UUID v4 strings (`queue_events.id` is bigserial) |
| Time | ISO-8601 UTC strings in API; `serviceDate` as `YYYY-MM-DD` |
| Errors | Always the envelope in API_CONTRACT §3 |
| Constants | Never hard-code event names, enums or error codes — import from `@mediqueue/shared` |
| Branches | `<member>/<task-id>-<slug>`, e.g. `a/A4-queue-service` (members A–D, see TEAM_TASKS.md) |
| PRs | 1 reviewer; any change to a contract file needs all 4 approvals and the doc updated **first** |
| Secrets | Never committed; `.env.example` only |
