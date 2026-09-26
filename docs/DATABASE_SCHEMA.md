# DATABASE_SCHEMA.md — MediQueue

> **Status: FROZEN.** PostgreSQL 16 + Prisma. `apps/server/prisma/schema.prisma` must mirror this file exactly.
> Naming: snake_case in DB, camelCase in Prisma models/API (`@map`). All `timestamptz` stored in UTC.

---

## 1. Entity relationship overview

```
departments 1───* doctors 1───* slots
     │               │  1          │
     │               │  └──0..1 staff (doctor login)
     │               │             │
     └──────* tokens *┘────────────┘ (slot_id nullable)
               │  *
               │  └──1 patients 1───* otp_requests (by phone, no FK)
               │
               ├──* queue_events   (audit log + ML training data)
               └──* notifications  (SMS/in-app log)

departments 1───* dept_daily_counters (token number sequence per day)
```

| Relationship | Type | On delete |
|---|---|---|
| doctors.department_id → departments.id | many-to-one | RESTRICT |
| slots.doctor_id → doctors.id | many-to-one | CASCADE |
| staff.doctor_id → doctors.id | one-to-one (nullable) | SET NULL |
| tokens.patient_id → patients.id | many-to-one | RESTRICT |
| tokens.department_id → departments.id | many-to-one | RESTRICT |
| tokens.doctor_id → doctors.id | many-to-one | RESTRICT |
| tokens.slot_id → slots.id | many-to-one (nullable) | SET NULL |
| queue_events.token_id → tokens.id | many-to-one | CASCADE |
| notifications.token_id → tokens.id | many-to-one | CASCADE |
| notifications.patient_id → patients.id | many-to-one (nullable) | SET NULL |
| dept_daily_counters.department_id → departments.id | many-to-one | CASCADE |

---

## 2. Enums

| Enum | Values | Notes |
|---|---|---|
| `role` | `STAFF`, `ADMIN` | Patients are a separate table, not a role here |
| `gender` | `MALE`, `FEMALE`, `OTHER` | |
| `token_type` | `SLOT`, `LIVE`, `KIOSK` | SLOT = booked time; LIVE = remote join now; KIOSK = walk-in |
| `priority` | `NONE`, `ELDERLY`, `PREGNANT`, `EMERGENCY` | `EMERGENCY` only via kiosk (staff-attended) |
| `token_status` | `WAITING`, `CALLED`, `COMPLETED`, `NO_SHOW`, `CANCELLED` | "Skipped" is not a status — see §4 |
| `queue_action` | `CREATED`, `CALLED`, `SKIPPED`, `NO_SHOW`, `COMPLETED`, `CANCELLED`, `NOTIFIED_THREE_AWAY` | |
| `actor_type` | `PATIENT`, `STAFF`, `ADMIN`, `KIOSK`, `SYSTEM`, `SIMULATOR` | |
| `notification_kind` | `TOKEN_CREATED`, `THREE_AWAY`, `CALLED`, `SKIPPED`, `NO_SHOW` | |
| `notification_channel` | `IN_APP`, `SMS_SIMULATED`, `SMS_TWILIO` | |
| `notification_status` | `SENT`, `FAILED` | |

---

## 3. Tables

### 3.1 `departments`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| name | varchar(60) | no | | UNIQUE — e.g. "General Medicine" |
| code | varchar(4) | no | | UNIQUE — e.g. `GM`, `PED`, `ORT`, `GYN`; token prefix |
| avg_consult_min | numeric(5,2) | no | `8` | Department default for new doctors |
| display_order | smallint | no | `0` | UI ordering |
| created_at | timestamptz | no | `now()` | |

### 3.2 `doctors`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| department_id | uuid | no | | FK → departments.id |
| name | varchar(80) | no | | "Dr. A. Sen" |
| room | varchar(20) | no | | "OPD-12" |
| is_active | boolean | no | `true` | Inactive doctors not auto-assigned |
| avg_consult_min | numeric(5,2) | no | `8` | EWMA, updated on each COMPLETED (α = 0.2, clamp 2–30) |
| created_at | timestamptz | no | `now()` | |

### 3.3 `slots`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| doctor_id | uuid | no | | FK → doctors.id |
| service_date | date | no | | Local date in `HOSPITAL_TZ` |
| start_time | timestamptz | no | | |
| end_time | timestamptz | no | | start + 15 min |
| capacity | smallint | no | `3` | |
| booked_count | smallint | no | `0` | CHECK `booked_count <= capacity`; increment in same tx as token insert |

Seed: 15-minute slots, 09:00–13:00 local, today + tomorrow, every doctor.

### 3.4 `patients`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| phone | varchar(10) | yes | | UNIQUE (NULLs allowed — kiosk walk-ins without phone). Indian 10-digit, no `+91`, regex `^[6-9]\d{9}$` |
| name | varchar(80) | yes | | NULL until profile completed |
| age | smallint | yes | | CHECK 0–120 |
| gender | gender | yes | | |
| consent_at | timestamptz | yes | | Must be set before booking (app patients) |
| is_walk_in | boolean | no | `false` | Created by kiosk |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | `@updatedAt` |

### 3.5 `otp_requests`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| phone | varchar(10) | no | | No FK (patient may not exist yet) |
| code_hash | char(64) | no | | `sha256(code + OTP_PEPPER)` hex |
| expires_at | timestamptz | no | | created + 5 min |
| attempts | smallint | no | `0` | Max 5 |
| consumed_at | timestamptz | yes | | Set on successful verify |
| created_at | timestamptz | no | `now()` | |

### 3.6 `staff`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| username | varchar(40) | no | | UNIQUE |
| password_hash | varchar(100) | no | | bcrypt, cost 10 |
| name | varchar(80) | no | | |
| role | role | no | `STAFF` | |
| doctor_id | uuid | yes | | FK → doctors.id, UNIQUE. Required for STAFF, NULL for ADMIN |
| created_at | timestamptz | no | `now()` | |

### 3.7 `tokens` (core table)

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| patient_id | uuid | no | | FK → patients.id |
| department_id | uuid | no | | FK → departments.id |
| doctor_id | uuid | no | | FK → doctors.id. Always set (auto-assigned if patient chose "any doctor") |
| slot_id | uuid | yes | | FK → slots.id. Required when `type = SLOT` |
| service_date | date | no | | Local date in `HOSPITAL_TZ` |
| token_seq | integer | no | | From `dept_daily_counters` |
| token_no | varchar(12) | no | | `<dept.code>-<seq 3-digit>` e.g. `GM-014` |
| type | token_type | no | | |
| priority | priority | no | `NONE` | |
| status | token_status | no | `WAITING` | |
| sort_key | bigint | no | | Epoch ms; queue order (§4) |
| slot_time | timestamptz | yes | | Copy of slot.start_time for SLOT tokens |
| skip_count | smallint | no | `0` | 2nd skip ⇒ NO_SHOW |
| notified_three_away | boolean | no | `false` | Alert fires once |
| created_at | timestamptz | no | `now()` | |
| called_at | timestamptz | yes | | Set on CALLED (latest call if re-called after skip) |
| ended_at | timestamptz | yes | | Set on COMPLETED / NO_SHOW / CANCELLED |
| updated_at | timestamptz | no | `now()` | `@updatedAt`; clients use it to drop stale socket payloads |

### 3.8 `dept_daily_counters`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| department_id | uuid | no | | PK part, FK → departments.id |
| service_date | date | no | | PK part |
| last_seq | integer | no | `0` | `UPDATE … SET last_seq = last_seq + 1 RETURNING last_seq` (upsert) inside token-create tx |

### 3.9 `queue_events`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | bigserial | no | | PK |
| token_id | uuid | no | | FK → tokens.id |
| department_id | uuid | no | | Denormalized for stats |
| doctor_id | uuid | no | | Denormalized for stats |
| action | queue_action | no | | |
| actor_type | actor_type | no | | |
| actor_id | uuid | yes | | staff.id / patients.id; NULL for SYSTEM/KIOSK |
| meta | jsonb | yes | | e.g. `{"reason":"second_skip"}`, `{"consultMin":7.4}`, `{"position":3}` |
| created_at | timestamptz | no | `now()` | |

### 3.10 `notifications`

| Column | Type | Null | Default | Constraints / notes |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| token_id | uuid | no | | FK → tokens.id |
| patient_id | uuid | yes | | FK → patients.id |
| kind | notification_kind | no | | |
| channel | notification_channel | no | | |
| to_phone_masked | varchar(12) | yes | | `98XXXXXX21`; full number never stored here |
| message | text | no | | Final rendered text |
| status | notification_status | no | `SENT` | |
| created_at | timestamptz | no | `now()` | |

---

## 4. Queue rules stored in the schema

### 4.1 Status state machine

| From | To | Trigger | Side effects |
|---|---|---|---|
| — | WAITING | create (app/kiosk) | counter++, slot.booked_count++ (SLOT), event CREATED, notification TOKEN_CREATED |
| WAITING | CALLED | staff `call-next` | called_at = now, event CALLED, notification CALLED |
| WAITING | CANCELLED | patient cancel | ended_at, slot.booked_count-- (SLOT), event CANCELLED |
| CALLED | COMPLETED | staff `complete` | ended_at, doctor.avg_consult_min EWMA update, event COMPLETED (meta.consultMin) |
| CALLED | NO_SHOW | staff `no-show` | ended_at, event NO_SHOW, notification NO_SHOW |
| CALLED | WAITING | staff `skip` and skip_count = 0 | skip_count = 1, new sort_key, called_at = NULL, event SKIPPED, notification SKIPPED |
| CALLED | NO_SHOW | staff `skip` and skip_count = 1 | ended_at, event NO_SHOW meta `{"reason":"second_skip"}` |

Every other transition → `409 INVALID_STATE`.

### 4.2 `sort_key` (epoch ms, ascending = earlier turn)

| Case | sort_key |
|---|---|
| base | `type = SLOT ? slot_time : created_at` |
| priority NONE | base |
| priority ELDERLY / PREGNANT | base − 900 000 (15 min) |
| priority EMERGENCY | base − 86 400 000 (24 h) → always front, FIFO among emergencies |
| after skip | let W = WAITING tokens of same doctor ordered by (sort_key, created_at, id), excluding this token. If `len(W) ≥ 3` → `W[2].sort_key + 1`; else if W non-empty → `last(W).sort_key + 1`; else `now` |

Queue order everywhere: `ORDER BY sort_key ASC, created_at ASC, id ASC`.
`ELDERLY` is auto-applied when `age ≥ 60` and requested priority is `NONE`.

### 4.3 Derived values (never stored)

| Value | Formula |
|---|---|
| position | 1 + count(WAITING tokens of same doctor ahead in order) |
| peopleAhead | position − 1 |
| remainingCurrentMin | if doctor has a CALLED token: `max(1, avgConsult − minutesSince(called_at))` else 0 |
| estimatedWaitMin | `round(remainingCurrentMin + peopleAhead × avgConsult)`; avgConsult = model prediction if `model.json` loaded else `doctors.avg_consult_min` |
| estimatedCallAt | `max(now + estimatedWaitMin, slot_time)` |
| 3-away alert | fire when status = WAITING, position ≤ 3, `notified_three_away = false` → set true in same tx |

---

## 5. Indexes & constraints

| Table | Index / constraint | Type | Purpose |
|---|---|---|---|
| departments | (code) | UNIQUE | |
| departments | (name) | UNIQUE | |
| doctors | (department_id, is_active) | BTREE | auto-assign, stats |
| slots | (doctor_id, start_time) | UNIQUE | |
| slots | (doctor_id, service_date) | BTREE | slot listing |
| patients | (phone) | UNIQUE | login |
| otp_requests | (phone, created_at DESC) | BTREE | latest OTP lookup, rate limit |
| staff | (username) | UNIQUE | |
| staff | (doctor_id) | UNIQUE | one login per doctor |
| tokens | (doctor_id, status, sort_key, created_at, id) | BTREE | **hot path**: queue order + position |
| tokens | (department_id, service_date, token_seq) | UNIQUE | token numbers |
| tokens | (department_id, service_date, status) | BTREE | admin stats, display |
| tokens | (patient_id, service_date) | BTREE | My tokens |
| tokens | (service_date, status) | BTREE | global stats |
| tokens | `uq_one_called_per_doctor` (doctor_id) WHERE status = 'CALLED' | **partial UNIQUE (raw SQL)** | makes double "call next" impossible |
| tokens | `uq_one_active_per_patient_dept_day` (patient_id, department_id, service_date) WHERE status IN ('WAITING','CALLED') | **partial UNIQUE (raw SQL)** | one active token per patient per dept per day |
| tokens | CHECK `type <> 'SLOT' OR slot_id IS NOT NULL` | CHECK (raw SQL) | |
| slots | CHECK `booked_count BETWEEN 0 AND capacity` | CHECK (raw SQL) | |
| patients | CHECK `age IS NULL OR age BETWEEN 0 AND 120` | CHECK (raw SQL) | |
| queue_events | (token_id) | BTREE | |
| queue_events | (department_id, created_at) | BTREE | stats, ML export |
| notifications | (created_at DESC) | BTREE | SMS log |
| notifications | (token_id) | BTREE | |

Partial unique indexes and CHECKs go in a hand-edited migration (`prisma migrate dev --create-only`, then append SQL).

---

## 6. Concurrency rules

| Operation | Rule |
|---|---|
| Any queue mutation | One Prisma interactive transaction. First statement: `SELECT id FROM doctors WHERE id = $doctorId FOR UPDATE` (serializes all mutations per doctor). |
| call-next | Inside lock: if a CALLED token exists → `409 CONSULT_IN_PROGRESS`; pick first WAITING by order → CALLED. Partial unique index is the safety net. |
| Token create | Lock doctor row, upsert counter, (SLOT) `UPDATE slots SET booked_count = booked_count + 1 WHERE id = $1 AND booked_count < capacity` → 0 rows ⇒ `409 SLOT_FULL`. |
| Emits | Only after commit (SOCKET_CONTRACT §5). |

---

## 7. Seed data (`prisma/seed.js`)

| Entity | Rows |
|---|---|
| departments | GM General Medicine, PED Paediatrics, ORT Orthopaedics, GYN Gynaecology |
| doctors | GM ×2, PED ×2, ORT ×1, GYN ×1 (6 total), rooms OPD-01…06 |
| staff | one STAFF per doctor (`dr.<lastname>` / `demo123`), one ADMIN (`admin` / `admin123`) |
| slots | today + tomorrow, 09:00–13:00, 15 min, capacity 3 |
| patients | 40 synthetic, phones `90000000NN`, names from a fixed synthetic list, consent set |
| tokens | 40 WAITING spread over 4 depts, mixed types/priorities (≈ 4 EMERGENCY, 6 ELDERLY, 3 PREGNANT) |

All data is synthetic (competition rule).
