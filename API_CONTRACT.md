# API_CONTRACT.md — MediQueue REST API v1

> **Status: FROZEN — single source of truth.** Frontend, backend and simulator implement exactly this.
> Change process: update this file first → all 4 approve → then code.

---

## 1. Conventions

| Item | Rule |
|---|---|
| Base URL | `{VITE_API_URL}` = `https://<server>/api/v1` (dev: `http://localhost:4000/api/v1`) |
| Format | JSON, `Content-Type: application/json`, camelCase |
| IDs | UUID strings |
| Time | ISO-8601 UTC (`2026-09-26T04:30:00.000Z`); dates `YYYY-MM-DD` (hospital local date) |
| Auth header | `Authorization: Bearer <jwt>` |
| Kiosk header | `X-Kiosk-Key: <KIOSK_KEY>` |
| Actor header | `X-Actor: SIMULATOR` — optional, honoured only for ADMIN JWT or valid kiosk key; sets `queue_events.actor_type` |
| Success codes | `200` read/action, `201` created |
| Phone format | 10 digits, regex `^[6-9]\d{9}$`, no `+91` |
| Enums | exactly as DATABASE_SCHEMA §2 |

### Auth levels

| Level | Meaning |
|---|---|
| `none` | public |
| `patient` | JWT with `role = "PATIENT"` |
| `staff` | JWT with `role = "STAFF"` **and** `doctorId` = path doctor; or `role = "ADMIN"` |
| `admin` | JWT with `role = "ADMIN"` |
| `kiosk` | valid `X-Kiosk-Key` |
| `signature` | query `s` = HMAC signature of tokenId |

### JWT payloads

| Role | Claims |
|---|---|
| Patient | `{ sub: patientId, role: "PATIENT", iat, exp }` |
| Staff | `{ sub: staffId, role: "STAFF", doctorId, deptId, iat, exp }` |
| Admin | `{ sub: staffId, role: "ADMIN", doctorId: null, deptId: null, iat, exp }` |

---

## 2. Shared objects

### 2.1 `Patient`
```json
{
  "id": "uuid",
  "phone": "9876543210",
  "phoneMasked": "98XXXXXX10",
  "name": "Riya Das",
  "age": 34,
  "gender": "FEMALE",
  "consentAt": "2026-09-26T03:10:00.000Z",
  "profileComplete": true
}
```
`profileComplete` = name, age and consentAt all set.

### 2.2 `Doctor`
```json
{
  "id": "uuid",
  "departmentId": "uuid",
  "name": "Dr. A. Sen",
  "room": "OPD-01",
  "isActive": true,
  "avgConsultMin": 7.5,
  "queueLength": 9,
  "currentTokenNo": "GM-011"
}
```

### 2.3 `Department`
```json
{
  "id": "uuid",
  "name": "General Medicine",
  "code": "GM",
  "queueLength": 17,
  "estimatedWaitMin": 42,
  "doctors": [ "Doctor" ]
}
```
`estimatedWaitMin` = wait for a new LIVE token on the auto-assigned doctor.

### 2.4 `Slot`
```json
{ "id": "uuid", "startTime": "…Z", "endTime": "…Z", "capacity": 3, "bookedCount": 1, "available": true }
```

### 2.5 `TokenPublic` (no personal data — used by `/t/:id` and display)
```json
{
  "id": "uuid",
  "tokenNo": "GM-014",
  "status": "WAITING",
  "priority": "NONE",
  "departmentName": "General Medicine",
  "doctorName": "Dr. A. Sen",
  "room": "OPD-01",
  "position": 4,
  "peopleAhead": 3,
  "estimatedWaitMin": 26,
  "estimatedCallAt": "…Z",
  "updatedAt": "…Z"
}
```
`position`, `peopleAhead`, `estimatedWaitMin`, `estimatedCallAt` are `null` when status ≠ `WAITING`. When status = `CALLED`, `position` = 0.

### 2.6 `Token` (full) = `TokenPublic` + these fields
```json
{
  "type": "LIVE",
  "departmentId": "uuid",
  "doctorId": "uuid",
  "slotId": null,
  "slotTime": null,
  "serviceDate": "2026-09-26",
  "patient": { "id": "uuid", "name": "Riya Das", "phoneMasked": "98XXXXXX10", "age": 34 },
  "createdAt": "…Z",
  "calledAt": null,
  "endedAt": null,
  "skipCount": 0,
  "notifiedThreeAway": false,
  "etaSource": "AVG",
  "trackUrl": "https://mediqueue.vercel.app/t/<id>?s=<sig>",
  "qrPayload": "https://mediqueue.vercel.app/t/<id>?s=<sig>"
}
```
`etaSource`: `"AVG"` | `"MODEL"`. `qrPayload` = `trackUrl` (scanning opens public tracking). `sig` = first 16 hex chars of `HMAC_SHA256(QR_SECRET, tokenId)`.

### 2.7 `QueueSnapshot` (staff panel)
```json
{
  "doctor": "Doctor",
  "department": { "id": "uuid", "name": "General Medicine", "code": "GM" },
  "current": "Token | null",
  "waiting": [ "Token" ],
  "stats": { "servedToday": 12, "noShowToday": 1, "waitingCount": 9, "avgConsultMin": 7.5 },
  "generatedAt": "…Z"
}
```
`waiting` is ordered by queue order (DATABASE_SCHEMA §4.2), `position` 1..n.

### 2.8 `DisplaySnapshot` (TV board, public)
```json
{
  "department": { "id": "uuid", "name": "General Medicine", "code": "GM" },
  "nowServing": [ { "doctorId": "uuid", "doctorName": "Dr. A. Sen", "room": "OPD-01", "tokenNo": "GM-011" } ],
  "upNext": [ { "tokenNo": "GM-012", "doctorName": "Dr. A. Sen", "room": "OPD-01", "priority": "ELDERLY" } ],
  "queueLength": 17,
  "generatedAt": "…Z"
}
```
`upNext` max 5 items across all doctors of the department, ordered by `estimatedCallAt`. `tokenNo` null if doctor idle.

### 2.9 `AdminStats`
```json
{
  "serviceDate": "2026-09-26",
  "totals": {
    "waiting": 38, "inConsultation": 5, "completedToday": 61, "noShowToday": 4,
    "cancelledToday": 2, "avgWaitMin": 23.4, "activeDoctors": 6
  },
  "departments": [
    {
      "departmentId": "uuid", "name": "General Medicine", "code": "GM",
      "queueLength": 17, "inConsultation": 2, "completedToday": 25, "noShowToday": 2,
      "avgWaitMin": 31.2, "avgConsultMin": 7.8, "activeDoctors": 2,
      "loadPerDoctor": 8.5, "longestWaitMin": 64
    }
  ],
  "hourly": [ { "hour": "09:00", "arrivals": 22, "completed": 15 } ],
  "generatedAt": "…Z"
}
```

| Metric | Definition |
|---|---|
| queueLength | count WAITING today |
| inConsultation | count CALLED |
| avgWaitMin | mean of `called_at − max(created_at, slot_time)` for tokens called today (latest call) |
| avgConsultMin | mean of active doctors' `avg_consult_min` |
| loadPerDoctor | queueLength / max(activeDoctors, 1) |
| longestWaitMin | max `now − max(created_at, slot_time)` among WAITING |
| hourly | local-hour buckets from first token today to now |

### 2.10 `Notification`
```json
{
  "id": "uuid", "tokenId": "uuid", "tokenNo": "GM-014",
  "kind": "THREE_AWAY", "channel": "SMS_SIMULATED", "toPhoneMasked": "98XXXXXX10",
  "message": "MediQueue: GM-014, you are 3rd in line for Dr. A. Sen (OPD-01). Est. wait 18 min.",
  "status": "SENT", "createdAt": "…Z"
}
```

---

## 3. Error envelope & codes

Every non-2xx response:
```json
{ "error": { "code": "SLOT_FULL", "message": "Human readable text", "details": {} } }
```
`details` optional (e.g. zod field errors: `{ "fields": { "phone": "Invalid phone" } }`).

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body/query fails zod schema |
| 400 | `INVALID_PHONE` | phone regex fails |
| 400 | `OTP_INVALID` | wrong code (attempts++) |
| 400 | `CONSENT_REQUIRED` | profile update without `consent: true` |
| 401 | `UNAUTHENTICATED` | missing/invalid/expired JWT |
| 401 | `INVALID_CREDENTIALS` | staff login failed |
| 401 | `INVALID_KIOSK_KEY` | kiosk header missing/wrong |
| 403 | `FORBIDDEN` | role or ownership mismatch; STAFF acting on another doctor |
| 403 | `PROFILE_INCOMPLETE` | booking before profile complete |
| 403 | `INVALID_SIGNATURE` | public token signature wrong |
| 404 | `NOT_FOUND` | unknown route |
| 404 | `DEPARTMENT_NOT_FOUND` | |
| 404 | `DOCTOR_NOT_FOUND` | |
| 404 | `SLOT_NOT_FOUND` | |
| 404 | `TOKEN_NOT_FOUND` | |
| 409 | `SLOT_FULL` | slot capacity reached |
| 409 | `SLOT_IN_PAST` | slot start already passed |
| 409 | `ACTIVE_TOKEN_EXISTS` | patient already has WAITING/CALLED token in this dept today (`details.tokenId`) |
| 409 | `INVALID_STATE` | illegal status transition (`details.status`) |
| 409 | `CONSULT_IN_PROGRESS` | call-next while a token is CALLED (`details.tokenId`) |
| 409 | `QUEUE_EMPTY` | call-next with no WAITING tokens |
| 410 | `OTP_EXPIRED` | no live OTP for phone |
| 422 | `DOCTOR_INACTIVE` | chosen doctor inactive |
| 422 | `NO_ACTIVE_DOCTOR` | dept has no active doctor for auto-assign |
| 422 | `DOCTOR_DEPARTMENT_MISMATCH` | doctorId not in departmentId |
| 429 | `OTP_RATE_LIMITED` | new OTP < 30 s after previous, or > 5 per 10 min |
| 429 | `OTP_TOO_MANY_ATTEMPTS` | 5 wrong attempts on current OTP |
| 429 | `RATE_LIMITED` | generic limiter |
| 500 | `INTERNAL` | unhandled |

---

## 4. Endpoints

### Index

| # | Method | URL | Auth | Req |
|---|---|---|---|---|
| E1 | GET | `/health` | none | — |
| E2 | POST | `/auth/otp/request` | none | M1 |
| E3 | POST | `/auth/otp/verify` | none | M1 |
| E4 | POST | `/auth/staff/login` | none | M4/M5 |
| E5 | GET | `/patients/me` | patient | M1 |
| E6 | PUT | `/patients/me` | patient | M1 |
| E7 | GET | `/departments` | none | M2 |
| E8 | GET | `/doctors/:doctorId/slots` | none | M2 |
| E9 | POST | `/tokens` | patient | M2 |
| E10 | GET | `/tokens/me` | patient | M2/M3 |
| E11 | GET | `/tokens/:tokenId` | patient (owner) / staff / admin | M3 |
| E12 | DELETE | `/tokens/:tokenId` | patient (owner) | M2 |
| E13 | GET | `/public/tokens/:tokenId?s=` | signature | M3 |
| E14 | GET | `/public/display/:departmentId` | none | M5 |
| E15 | POST | `/kiosk/tokens` | kiosk | bonus |
| E16 | GET | `/staff/doctors/:doctorId/queue` | staff | M4 |
| E17 | POST | `/staff/doctors/:doctorId/call-next` | staff | M4 |
| E18 | POST | `/staff/tokens/:tokenId/skip` | staff | M4 |
| E19 | POST | `/staff/tokens/:tokenId/no-show` | staff | M4 |
| E20 | POST | `/staff/tokens/:tokenId/complete` | staff | M4 |
| E21 | GET | `/admin/stats` | admin | M5 |
| E22 | GET | `/admin/notifications` | admin | M6 |
| E23 | GET | `/admin/simulator` | admin | demo |
| E24 | POST | `/admin/simulator` | admin | demo |
| E25 | POST | `/admin/demo/reset` | admin + `DEMO_MODE` | demo |

For E18–E20 `staff` auth means: token's doctorId must equal JWT `doctorId`, or role ADMIN.

---

### E1 `GET /health`
**Response 200**
```json
{ "status": "ok", "db": "ok", "time": "…Z", "version": "1.0.0" }
```
Errors: `500 INTERNAL` (`db: "down"`).

---

### E2 `POST /auth/otp/request`
**Request**
```json
{ "phone": "9876543210" }
```
**Response 200**
```json
{ "phone": "9876543210", "expiresInSec": 300, "resendAfterSec": 30, "devOtp": "482913" }
```
`devOtp` present **only** when `DEMO_MODE=true` (UI shows it as "SMS simulated" toast). Code = 6 random digits; stored hashed.
Errors: `400 VALIDATION_ERROR`, `400 INVALID_PHONE`, `429 OTP_RATE_LIMITED`.

---

### E3 `POST /auth/otp/verify`
**Request**
```json
{ "phone": "9876543210", "code": "482913" }
```
**Response 200**
```json
{ "accessToken": "jwt", "expiresIn": 43200, "isNewPatient": true, "patient": "Patient" }
```
Creates patient row on first verify. Marks OTP consumed.
Errors: `400 VALIDATION_ERROR`, `400 OTP_INVALID` (`details.attemptsLeft`), `410 OTP_EXPIRED`, `429 OTP_TOO_MANY_ATTEMPTS`.

---

### E4 `POST /auth/staff/login`
**Request**
```json
{ "username": "dr.sen", "password": "demo123" }
```
**Response 200**
```json
{
  "accessToken": "jwt", "expiresIn": 43200,
  "staff": { "id": "uuid", "name": "Dr. A. Sen", "role": "STAFF", "doctorId": "uuid", "departmentId": "uuid" }
}
```
Admin: `role: "ADMIN"`, `doctorId: null`, `departmentId: null`.
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`.

---

### E5 `GET /patients/me`
**Response 200** → `Patient`
Errors: `401 UNAUTHENTICATED`.

### E6 `PUT /patients/me`
**Request**
```json
{ "name": "Riya Das", "age": 34, "gender": "FEMALE", "consent": true }
```
| Field | Rule |
|---|---|
| name | 2–80 chars, required |
| age | int 0–120, required |
| gender | enum, optional |
| consent | must be `true` (sets `consentAt` if not already set) |

**Response 200** → `Patient`
Errors: `400 VALIDATION_ERROR`, `400 CONSENT_REQUIRED`, `401 UNAUTHENTICATED`.

---

### E7 `GET /departments`
**Response 200**
```json
{ "departments": [ "Department" ], "serviceDate": "2026-09-26" }
```
Ordered by `display_order`. Errors: none beyond 500.

### E8 `GET /doctors/:doctorId/slots?date=YYYY-MM-DD`
`date` optional, default today (hospital TZ). Only today/tomorrow allowed.
**Response 200**
```json
{ "doctorId": "uuid", "date": "2026-09-26", "slots": [ "Slot" ] }
```
`available` = `bookedCount < capacity && startTime > now`.
Errors: `400 VALIDATION_ERROR`, `404 DOCTOR_NOT_FOUND`.

---

### E9 `POST /tokens`
**Request**
```json
{ "departmentId": "uuid", "doctorId": "uuid | null", "type": "LIVE", "slotId": null, "priority": "NONE" }
```
| Field | Rule |
|---|---|
| departmentId | required |
| doctorId | optional; null ⇒ auto-assign active doctor with fewest WAITING (tie → lowest avgConsultMin) |
| type | `LIVE` or `SLOT` (`KIOSK` rejected here) |
| slotId | required iff `type = SLOT`; slot must belong to doctorId (doctorId required for SLOT) |
| priority | `NONE` \| `ELDERLY` \| `PREGNANT` (`EMERGENCY` rejected → 400) ; default `NONE` |

**Response 201** → `Token`
Side effects: socket emits per SOCKET_CONTRACT §5 (T1); may immediately trigger 3-away alert if position ≤ 3.
Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 PROFILE_INCOMPLETE`, `404 DEPARTMENT_NOT_FOUND`, `404 DOCTOR_NOT_FOUND`, `404 SLOT_NOT_FOUND`, `409 SLOT_FULL`, `409 SLOT_IN_PAST`, `409 ACTIVE_TOKEN_EXISTS`, `422 DOCTOR_INACTIVE`, `422 NO_ACTIVE_DOCTOR`, `422 DOCTOR_DEPARTMENT_MISMATCH`.

### E10 `GET /tokens/me`
**Response 200**
```json
{ "active": [ "Token" ], "history": [ "Token" ] }
```
`active` = today WAITING/CALLED; `history` = today's ended tokens (newest first).
Errors: `401 UNAUTHENTICATED`.

### E11 `GET /tokens/:tokenId`
**Response 200** → `Token` (also the polling-fallback endpoint).
Errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 TOKEN_NOT_FOUND`.

### E12 `DELETE /tokens/:tokenId`
Cancels a WAITING token.
**Response 200** → `Token` (status `CANCELLED`).
Errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 TOKEN_NOT_FOUND`, `409 INVALID_STATE`.

---

### E13 `GET /public/tokens/:tokenId?s=<sig>`
**Response 200** → `TokenPublic`
Errors: `403 INVALID_SIGNATURE`, `404 TOKEN_NOT_FOUND`.

### E14 `GET /public/display/:departmentId`
**Response 200** → `DisplaySnapshot`
Errors: `404 DEPARTMENT_NOT_FOUND`.

---

### E15 `POST /kiosk/tokens` (bonus: walk-in kiosk)
Header: `X-Kiosk-Key`.
**Request**
```json
{ "name": "Ramesh Kumar", "phone": "9123456780", "age": 67, "departmentId": "uuid", "doctorId": null, "priority": "NONE" }
```
| Field | Rule |
|---|---|
| name | required, 2–80 |
| phone | optional; if given and patient exists → reuse patient |
| age | optional int 0–120 (≥ 60 ⇒ ELDERLY auto) |
| priority | any enum incl. `EMERGENCY` |

Creates `type = KIOSK`, `is_walk_in = true` patient if new, `consent_at = now` (verbal consent at kiosk).
**Response 201**
```json
{ "token": "Token", "print": { "tokenNo": "GM-021", "departmentName": "General Medicine", "doctorName": "Dr. A. Sen", "room": "OPD-01", "position": 7, "estimatedWaitMin": 44, "trackUrl": "…", "issuedAt": "…Z" } }
```
Errors: `400 VALIDATION_ERROR`, `401 INVALID_KIOSK_KEY`, `404 DEPARTMENT_NOT_FOUND`, `404 DOCTOR_NOT_FOUND`, `409 ACTIVE_TOKEN_EXISTS`, `422 DOCTOR_INACTIVE`, `422 NO_ACTIVE_DOCTOR`, `429 RATE_LIMITED`.

---

### E16 `GET /staff/doctors/:doctorId/queue`
**Response 200** → `QueueSnapshot`
Errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 DOCTOR_NOT_FOUND`.

### E17 `POST /staff/doctors/:doctorId/call-next`
Body: `{}`
Moves first WAITING → CALLED.
**Response 200**
```json
{ "token": "Token", "queue": "QueueSnapshot" }
```
Errors: `401`, `403 FORBIDDEN`, `404 DOCTOR_NOT_FOUND`, `409 CONSULT_IN_PROGRESS`, `409 QUEUE_EMPTY`.

### E18 `POST /staff/tokens/:tokenId/skip`
Body: `{}` — token must be CALLED. First skip → back to WAITING behind 3 people; second skip → NO_SHOW.
**Response 200**
```json
{ "token": "Token", "queue": "QueueSnapshot", "result": "REQUEUED" }
```
`result`: `"REQUEUED"` | `"NO_SHOW"`.
Errors: `401`, `403 FORBIDDEN`, `404 TOKEN_NOT_FOUND`, `409 INVALID_STATE`.

### E19 `POST /staff/tokens/:tokenId/no-show`
Body: `{}` — token must be CALLED.
**Response 200** → `{ "token": "Token", "queue": "QueueSnapshot" }`
Errors: `401`, `403 FORBIDDEN`, `404 TOKEN_NOT_FOUND`, `409 INVALID_STATE`.

### E20 `POST /staff/tokens/:tokenId/complete`
Body: `{}` — token must be CALLED. Updates doctor EWMA.
**Response 200** → `{ "token": "Token", "queue": "QueueSnapshot" }`
Errors: `401`, `403 FORBIDDEN`, `404 TOKEN_NOT_FOUND`, `409 INVALID_STATE`.

---

### E21 `GET /admin/stats`
**Response 200** → `AdminStats`
Errors: `401`, `403 FORBIDDEN`.

### E22 `GET /admin/notifications?limit=50&before=<ISO>`
`limit` 1–200 (default 50). `before` for pagination.
**Response 200**
```json
{ "items": [ "Notification" ], "nextBefore": "…Z | null" }
```
Errors: `400 VALIDATION_ERROR`, `401`, `403 FORBIDDEN`.

### E23 `GET /admin/simulator`
**Response 200** → `SimulatorStatus`
```json
{ "running": false, "speed": 10, "startedAt": null, "tokensCreated": 0, "actionsPerformed": 0 }
```

### E24 `POST /admin/simulator`
**Request**
```json
{ "action": "start", "speed": 10, "arrivalsPerMin": 6 }
```
`action`: `start` | `stop`. `speed` 1–60 (default 10). `arrivalsPerMin` 1–30 (default 6, in simulated minutes).
**Response 200** → `SimulatorStatus`
Errors: `400 VALIDATION_ERROR`, `401`, `403 FORBIDDEN`, `409 INVALID_STATE` (start when running / stop when stopped).

### E25 `POST /admin/demo/reset`
Only when `DEMO_MODE=true`. Stops simulator, deletes today's tokens/events/notifications/counters, re-runs token seed (40 WAITING).
**Response 200**
```json
{ "ok": true, "tokensSeeded": 40 }
```
Emits `demo:reset` (SOCKET_CONTRACT). Errors: `401`, `403 FORBIDDEN` (also when `DEMO_MODE` false).

---

## 5. Rate limits

| Scope | Limit |
|---|---|
| `/auth/otp/request` per phone | 1 per 30 s, 5 per 10 min |
| `/auth/otp/request` per IP | 20 per 10 min |
| `/auth/otp/verify` per OTP | 5 attempts |
| `/kiosk/tokens` per key | 60 per min |
| Everything else | none (hackathon) |
Simulator requests carrying ADMIN JWT or kiosk key bypass the per-IP OTP limit.

---

## 6. CORS & security

| Item | Rule |
|---|---|
| CORS | `CORS_ORIGIN` only; credentials not used (Bearer header) |
| Passwords | bcrypt |
| OTP | hashed, 5-min TTL, single use |
| Phone numbers | masked in every response except `Patient.phone` for the owner |
| Public endpoints | never return names or phone numbers |
| Helmet | enabled with defaults |
