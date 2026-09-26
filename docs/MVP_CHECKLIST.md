# MVP_CHECKLIST.md — Mandatory requirements only (M1–M6)

> Scope: the 6 must-haves from HT-01. **No bonuses in this file.**
> A requirement is **DONE** only when every box is ticked **on the deployed build** and its demo proof has been recorded.
> Refs: `API_CONTRACT.md` (E#), `SOCKET_CONTRACT.md` (T#), `DATABASE_SCHEMA.md` (§).

## Status board

Owners: **A** Backend · **B** Patient frontend · **C** Ops frontend · **D** Platform/Demo (see TEAM_TASKS.md)

| ID | Requirement | Owner | Backend | Frontend | E2E on deploy | Demo clip |
|---|---|---|---|---|---|---|
| M1 | Mobile + OTP registration | A / B | ☐ | ☐ | ☐ | ☐ |
| M2 | Book slot / join queue + QR token | A / B | ☐ | ☐ | ☐ | ☐ |
| M3 | Live position + ETA in real time | A / B | ☐ | ☐ | ☐ | ☐ |
| M4 | Staff panel: call next, skip, no-show, complete | A / C | ☐ | ☐ | ☐ | ☐ |
| M5 | Admin dashboard: queue length, avg wait, load per dept | A / C | ☐ | ☐ | ☐ | ☐ |
| M6 | Notification at 3 turns away | A / B / C | ☐ | ☐ | ☐ | ☐ |

---

## M1 — Patient registration via mobile number + OTP (simulated)

**Contract:** E2, E3, E5, E6 · tables `patients`, `otp_requests`

### Acceptance criteria
- [ ] Phone input accepts only 10-digit Indian numbers (`^[6-9]\d{9}$`); invalid → inline error from `INVALID_PHONE`
- [ ] E2 generates 6-digit OTP, stores **hash** only, TTL 5 min
- [ ] OTP shown to user as "SMS simulated" toast (from `devOtp`) and printed in server log
- [ ] Resend disabled for 30 s (countdown in UI)
- [ ] Wrong OTP → `OTP_INVALID` with attempts left; 5 wrong → `OTP_TOO_MANY_ATTEMPTS`
- [ ] Expired OTP → `OTP_EXPIRED`, UI offers resend
- [ ] Correct OTP → JWT stored, patient row created on first login (`isNewPatient`)
- [ ] New patient forced to profile page: name, age, gender, **consent checkbox**; cannot book until `profileComplete`
- [ ] Returning patient (same phone) skips profile and lands on booking
- [ ] Refreshing the page keeps the patient logged in; logout clears JWT

### Test
1. Enter `9876543210` → toast shows OTP.
2. Enter wrong code twice → error shows attempts left.
3. Enter right code → profile → save with consent → booking page.
4. Log out, log in again with same number → straight to booking.

**Demo proof:** 30 s clip of steps 1–3.

---

## M2 — Book a slot or join a live queue; digital token with QR

**Contract:** E7, E8, E9, E10, E12 · T1, T2 · tables `tokens`, `slots`, `dept_daily_counters`

### Acceptance criteria
- [ ] Department list shows ≥ 3 departments with live queue length and estimated wait
- [ ] Doctor choice optional; "Any doctor" auto-assigns the shortest queue
- [ ] **Join now** creates `LIVE` token
- [ ] **Book slot** shows today's/tomorrow's 15-min slots; full/past slots disabled; creates `SLOT` token
- [ ] Token number format `<CODE>-<NNN>` (e.g. `GM-014`), unique per dept per day
- [ ] Token screen shows token number, dept, doctor, room, **QR code** (encodes `trackUrl`)
- [ ] Scanning the QR with another phone opens `/t/:id?s=` and shows the same token (no login)
- [ ] Second active token in same dept same day → `ACTIVE_TOKEN_EXISTS`, UI links to existing token
- [ ] Full slot → `SLOT_FULL` message, list refreshes
- [ ] Patient can cancel a WAITING token; slot capacity is released
- [ ] "My tokens" lists today's active + ended tokens

### Test
1. Join now in General Medicine → token + QR appear.
2. Try joining GM again → blocked with link to existing token.
3. Book a slot in Paediatrics → SLOT token with slot time shown.
4. Scan QR with a second phone → public tracking page loads.
5. Cancel the Paediatrics token → status CANCELLED, slot count decreases.

**Demo proof:** booking + QR + scan on second device.

---

## M3 — Live queue position and estimated waiting time (real-time)

**Contract:** E11, E13 · `subscribe:token`, `subscribe:tokenPublic`, `token:update`, `tokenPublic:update` · T1–T7 · ETA formula DATABASE_SCHEMA §4.3

### Acceptance criteria
- [ ] Token page shows **position** ("You are 5th"), **people ahead**, **estimated wait (min)**, **estimated call time**
- [ ] Values update **without refresh** within 1 s of any staff action on that doctor
- [ ] ETA uses current consultation remaining time + people ahead × doctor average
- [ ] ETA refreshes every 30 s even without queue changes (T7)
- [ ] Doctor average consult time updates after each completion (EWMA) and ETAs change accordingly
- [ ] Status transitions shown: Waiting → Called → Completed / No-show / Cancelled
- [ ] Connection pill shows `Live`; on socket loss > 5 s switches to `Polling` (REST every 10 s) and back to `Live` on reconnect
- [ ] Public QR tracking page gets the same live updates (no personal data shown)
- [ ] Out-of-order payloads ignored (`updatedAt` check)

### Test
1. Patient page (phone) + staff panel (laptop) side by side.
2. Call next ×2 → position drops by 2 live.
3. Complete a consult quickly → ETAs for everyone drop.
4. Kill Wi-Fi on phone 10 s → pill `Offline/Polling`; restore → `Live` with correct numbers.

**Demo proof:** split-screen clip of step 2.

---

## M4 — Staff/doctor panel: call next, skip, mark no-show, mark complete

**Contract:** E4, E16–E20 · `subscribe:doctor`, `queue:update` · T3–T6 · state machine DATABASE_SCHEMA §4.1

### Acceptance criteria
- [ ] Staff login (`dr.<name>` / `demo123`); STAFF sees only own doctor; ADMIN can open any doctor
- [ ] Panel shows **Current patient** card (token no, name, age, priority, called time) and ordered **Waiting list** with position + wait so far
- [ ] **Call next** → first WAITING becomes CALLED; disabled while a patient is CALLED (`CONSULT_IN_PROGRESS`)
- [ ] **Complete** → CALLED → COMPLETED; enables Call next
- [ ] **Skip** → CALLED → back to WAITING behind 3 people; second skip → NO_SHOW automatically
- [ ] **No-show** → CALLED → NO_SHOW
- [ ] Double-click / two staff tabs never produce two CALLED tokens (DB partial unique index + row lock)
- [ ] Every action updates panel instantly (response `queue`) and other open panels via `queue:update`
- [ ] Every action writes a `queue_events` row
- [ ] Today counters on panel: served, no-shows, waiting, avg consult

### Test
1. Call next → Complete → Call next → Skip → Call next → No-show.
2. Verify patient screens reflect each step.
3. Open same panel in 2 tabs, click Call next in both simultaneously → one succeeds, other shows 409 message.

**Demo proof:** clip of step 1 with patient phone visible.

---

## M5 — Admin dashboard: queue length, average wait time, patient load per department

**Contract:** E21 · `subscribe:admin`, `stats:update` · metric definitions API_CONTRACT §2.9

### Acceptance criteria
- [ ] Admin login (`admin` / `admin123`); non-admin gets 403
- [ ] Top KPI cards: total waiting, in consultation, completed today, **average wait time**
- [ ] Per-department cards/table (≥ 3 depts): **queue length**, **avg wait**, in consultation, completed, no-shows, active doctors, **load per doctor**, longest wait
- [ ] Chart 1: bar — queue length (patient load) per department
- [ ] Chart 2: line/bar — arrivals vs completed per hour
- [ ] Updates live (≤ 1 s after actions, throttled) without refresh
- [ ] Numbers match DB (spot-check one dept by hand)
- [ ] Heavily loaded department visually highlighted (e.g. load per doctor ≥ 8)

### Test
1. Admin dashboard open; create 3 tokens in ORT from phones → ORT queue length +3 live.
2. Complete 2 in GM → GM completed +2, avg wait recalculated.

**Demo proof:** dashboard clip while seeded/demo data (3+ depts, 30+ patients) is moving.

---

## M6 — Notification when patient is 3 turns away

**Contract:** `token:alert`, `notification:new` · E22 · rule SOCKET_CONTRACT §5.1 · table `notifications`

### Acceptance criteria
- [ ] Fires when a WAITING token reaches position ≤ 3 (including if created at position ≤ 3)
- [ ] Fires **exactly once** per token (`notified_three_away`)
- [ ] Patient app: toast/banner "You are 3rd in line — move near OPD-01" + vibration
- [ ] Browser Notification shown if permission granted (permission asked on token page)
- [ ] Public QR tracking page also shows the alert
- [ ] Simulated SMS written to `notifications` (masked phone, full message) and visible live on `/admin/sms`
- [ ] Also on-screen when called: full-screen "Go to OPD-01 now" + chime (`token:called`)
- [ ] Works when the patient's page was opened after the alert fired (banner derived from `notifiedThreeAway` + position)

### Test
1. Patient at position 6; staff calls next 3× → alert appears at position 3 only once.
2. `/admin/sms` shows new THREE_AWAY row live.
3. Continue → patient sees full-screen called alert.

**Demo proof:** close-up of phone receiving alert + SMS log.

---

## Global definition of done (applies to M1–M6)

- [ ] Implemented exactly per API/Socket contracts (no undocumented fields/events)
- [ ] Errors shown as friendly messages (no raw JSON, no blank screens)
- [ ] Works on a mid-range Android Chrome at 360 px width (patient) and 1366 px (staff/admin)
- [ ] Works on the deployed URLs, not just localhost
- [ ] Row updated in `docs/REQUIREMENT_CHECKLIST.md` with screenshot
