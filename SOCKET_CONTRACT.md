# SOCKET_CONTRACT.md — MediQueue Socket.IO v1

> **Status: FROZEN — single source of truth** for real-time behaviour.
> Payload shapes (`Token`, `TokenPublic`, `QueueSnapshot`, `DisplaySnapshot`, `AdminStats`, `Notification`, `SimulatorStatus`) are defined in **API_CONTRACT.md §2 / E23**. Do not redefine them.
> All names below live as constants in `packages/shared/events.js`.

---

## 1. Connection

| Item | Value |
|---|---|
| Library | Socket.IO v4 (server + `socket.io-client`) |
| URL | `VITE_SOCKET_URL` (same host/port as API, path `/socket.io`) |
| Transports | `["websocket", "polling"]` |
| Handshake | `io(URL, { auth: { accessToken?: "<jwt>" } })` — JWT optional (public screens connect without it) |
| Handshake result | invalid/expired JWT → `connect_error` with `err.message = "UNAUTHENTICATED"`; client clears token and reconnects anonymously |
| Server socket data | `socket.data.user = { role: "PATIENT"|"STAFF"|"ADMIN", id, doctorId? } | null` |
| One socket per tab | `lib/socket.js` owns it; pages call `subscribe/unsubscribe` |

---

## 2. Rooms

| Room name | Builder (`shared/events.js`) | Members | Content level |
|---|---|---|---|
| `token:{tokenId}` | `rooms.token(id)` | Owning patient, staff/admin | full `Token` |
| `tokenpub:{tokenId}` | `rooms.tokenPublic(id)` | Anyone with valid signature (QR tracking) | `TokenPublic` |
| `doctor:{doctorId}` | `rooms.doctor(id)` | STAFF of that doctor, ADMIN | `QueueSnapshot` |
| `dept:{departmentId}` | `rooms.dept(id)` | Anyone (TV display) | `DisplaySnapshot` |
| `admin` | `rooms.admin()` | ADMIN | `AdminStats`, `Notification`, `SimulatorStatus` |

Clients **never** join rooms directly; they emit a subscribe event and the server authorizes.

---

## 3. Client → Server events (all use acknowledgements)

Ack shape (every subscribe):
```json
{ "ok": true, "room": "doctor:<id>", "snapshot": { } }
```
or
```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "…" } }
```
The `snapshot` is the **current state** at join time → client renders it immediately (no REST/socket race).

| Event | Payload | Authorization | Joins | Ack `snapshot` |
|---|---|---|---|---|
| `subscribe:token` | `{ "tokenId": "uuid" }` | patient owner, STAFF of token's doctor, ADMIN | `token:{id}` | `Token` |
| `subscribe:tokenPublic` | `{ "tokenId": "uuid", "sig": "16hex" }` | valid signature | `tokenpub:{id}` | `TokenPublic` |
| `subscribe:doctor` | `{ "doctorId": "uuid" }` | STAFF with same doctorId, ADMIN | `doctor:{id}` | `QueueSnapshot` |
| `subscribe:dept` | `{ "departmentId": "uuid" }` | none | `dept:{id}` | `DisplaySnapshot` |
| `subscribe:admin` | `{}` | ADMIN | `admin` | `{ "stats": AdminStats, "simulator": SimulatorStatus }` |
| `unsubscribe` | `{ "room": "doctor:<id>" }` | — | leaves room | `{ "ok": true }` (no snapshot) |

Ack error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_SIGNATURE`, `TOKEN_NOT_FOUND`, `DOCTOR_NOT_FOUND`, `DEPARTMENT_NOT_FOUND`, `VALIDATION_ERROR`.
No other client→server events exist. **All mutations go through REST.**

---

## 4. Server → Client events

| Event | Room(s) | Payload | Purpose |
|---|---|---|---|
| `token:update` | `token:{id}` | `Token` | Position / ETA / status changed |
| `tokenPublic:update` | `tokenpub:{id}` | `TokenPublic` | Same, public view |
| `token:alert` | `token:{id}`, `tokenpub:{id}` | `TokenAlert` | **3 turns away** (M6) |
| `token:called` | `token:{id}`, `tokenpub:{id}` | `TokenCalled` | "Go to room now" full-screen alert |
| `token:skipped` | `token:{id}`, `tokenpub:{id}` | `TokenSkipped` | Patient was skipped / re-queued |
| `token:ended` | `token:{id}`, `tokenpub:{id}` | `TokenEnded` | COMPLETED / NO_SHOW / CANCELLED |
| `queue:update` | `doctor:{id}` | `QueueSnapshot` | Staff panel refresh |
| `display:update` | `dept:{id}` | `DisplaySnapshot` | TV board refresh |
| `stats:update` | `admin` | `AdminStats` | Admin dashboard (throttled) |
| `notification:new` | `admin` | `Notification` | Live simulated-SMS log |
| `simulator:status` | `admin` | `SimulatorStatus` | Simulator toggle state |
| `demo:reset` | all sockets (`io.emit`) | `{ "at": "…Z" }` | Clients refetch / resubscribe |

### 4.1 Event-specific payloads

**`TokenAlert`**
```json
{
  "tokenId": "uuid", "tokenNo": "GM-014", "kind": "THREE_AWAY",
  "position": 3, "estimatedWaitMin": 18,
  "doctorName": "Dr. A. Sen", "room": "OPD-01",
  "message": "You are 3rd in line. Please move near OPD-01.",
  "at": "…Z"
}
```

**`TokenCalled`**
```json
{ "tokenId": "uuid", "tokenNo": "GM-014", "doctorName": "Dr. A. Sen", "room": "OPD-01", "calledAt": "…Z" }
```

**`TokenSkipped`**
```json
{ "tokenId": "uuid", "tokenNo": "GM-014", "result": "REQUEUED", "position": 4, "skipCount": 1, "message": "You were not at OPD-01. You are now 4th in line.", "at": "…Z" }
```
`result = "NO_SHOW"` ⇒ `position: null`.

**`TokenEnded`**
```json
{ "tokenId": "uuid", "tokenNo": "GM-014", "status": "COMPLETED", "endedAt": "…Z" }
```

---

## 5. Emission matrix (when each event fires)

All emits happen **after the DB transaction commits**, from `realtime/emitters.js` only.
"Affected WAITING tokens" = every WAITING token of the same doctor whose `position` or `estimatedWaitMin` changed (implementation may simply send all WAITING tokens of that doctor — max ~50).

| # | Trigger (REST / timer) | Emits, in this order |
|---|---|---|
| T1 | Token created — E9 `POST /tokens`, E15 kiosk | `token:update` + `tokenPublic:update` (new token) → `token:update`/`tokenPublic:update` for affected WAITING (priority tokens push others back) → `token:alert` for any token crossing position ≤ 3 → `queue:update` → `display:update` → `stats:update`* → `notification:new` (TOKEN_CREATED, and THREE_AWAY if fired) |
| T2 | Token cancelled — E12 | `token:ended` → `token:update`/`tokenPublic:update` (cancelled) → updates for affected WAITING → `token:alert` (crossings) → `queue:update` → `display:update` → `stats:update`* |
| T3 | Call next — E17 | `token:called` → `token:update`/`tokenPublic:update` (called token) → updates for all remaining WAITING → `token:alert` (crossings) → `queue:update` → `display:update` → `stats:update`* → `notification:new` (CALLED, THREE_AWAY) |
| T4 | Skip — E18 | `token:skipped` → `token:update`/`tokenPublic:update` (skipped token) → (if NO_SHOW) `token:ended` → updates for affected WAITING → `token:alert` (crossings) → `queue:update` → `display:update` → `stats:update`* → `notification:new` (SKIPPED or NO_SHOW, THREE_AWAY) |
| T5 | No-show — E19 | `token:ended` → `token:update`/`tokenPublic:update` → updates for WAITING (ETA of current consult resets) → `queue:update` → `display:update` → `stats:update`* → `notification:new` (NO_SHOW) |
| T6 | Complete — E20 | `token:ended` → `token:update`/`tokenPublic:update` → updates for WAITING (new EWMA ⇒ new ETAs) → `queue:update` → `display:update` → `stats:update`* |
| T7 | ETA tick — every `ETA_TICK_MS` (30 s) | For each doctor with a CALLED token or WAITING tokens: `token:update`/`tokenPublic:update` for WAITING whose `estimatedWaitMin` changed → `queue:update` → `display:update` ; then `stats:update`* once |
| T8 | Simulator start/stop — E24 | `simulator:status` |
| T9 | Demo reset — E25 | `simulator:status` → `demo:reset` (to everyone) |

\* `stats:update` is **throttled**: at most one per 1000 ms per server, trailing edge (last state always sent).

### 5.1 3-turns-away rule (M6)

| Rule | Detail |
|---|---|
| Condition | `status = WAITING` **and** `position ≤ 3` **and** `notified_three_away = false` |
| Checked | inside every mutation transaction (T1–T6) for all WAITING tokens of that doctor |
| Effect in tx | set `notified_three_away = true`; insert `queue_events` (NOTIFIED_THREE_AWAY); insert `notifications` (IN_APP + SMS_SIMULATED) |
| Emit after commit | `token:alert` to both token rooms; `notification:new` to `admin` |
| Fires once | never re-fires for that token, even after a skip |

---

## 6. Client behaviour rules

| Rule | Detail |
|---|---|
| Subscribe on mount | Page calls `subscribe(...)` → renders ack `snapshot` |
| Stale protection | Drop any `Token`/`TokenPublic` whose `updatedAt` < current; drop snapshots whose `generatedAt` < current |
| Reconnect | On `connect` (incl. reconnect), `lib/socket.js` re-emits every active subscription and replaces state with ack snapshots |
| Polling fallback (M3) | If socket not connected for > 5 s → poll the matching REST endpoint every 10 s (E11 / E13 / E16 / E14 / E21). Stop polling on reconnect. `ConnectionPill` shows `Live` / `Polling` / `Offline`. |
| Alerts | `token:alert` → toast + `Notification` API (if permitted) + `navigator.vibrate([200,100,200])`. `token:called` → full-screen modal + chime. |
| `demo:reset` | Clear local state, re-subscribe, refetch. Patient pages whose token no longer exists → go to `/patient/book`. |
| Unmount | `unsubscribe({ room })` |

---

## 7. Server implementation rules

| Rule | Detail |
|---|---|
| Single emitter module | Services return a `changes` object (`{ doctorIds, tokenIds, alerts[], called?, skipped?, ended[], notifications[] }`); `emitters.flush(changes)` does all emitting in §5 order |
| Snapshot builders | Same presenter functions as REST (`presenter.js`, `stats.service.js`) — REST and socket payloads must be byte-for-byte identical shapes |
| Scale | Single Node process; no Redis adapter (frozen) |
| Logging | Log every emit in dev: `[emit] queue:update doctor:<id>` |

---

## 8. Quick test recipe

| Step | Action | Expect |
|---|---|---|
| 1 | Open patient token page (tab A) and staff panel for same doctor (tab B) | Both show same position |
| 2 | Tab B: Call next | A: position −1 within 1 s, no refresh |
| 3 | Repeat until A position = 3 | A: toast + vibration; `/admin/sms` shows THREE_AWAY row |
| 4 | Tab B: Call next until A is called | A: full-screen "Go to OPD-01" |
| 5 | Stop server 10 s | A: pill → `Polling`/`Offline` |
| 6 | Start server | A: pill → `Live`, state correct |
