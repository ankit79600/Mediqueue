[README.md](https://github.com/user-attachments/files/32680954/README.md)
# MediQueue — Smart OPD Queue & Appointment System

MediQueue is a real-time OPD queue and appointment management platform built for the **CodeVoyage HT-01** problem statement.

The system connects patients, doctors/staff, and administrators through a shared queue platform. Patients can register, join a queue or book a slot, receive a digital token/QR, and track their live queue position. Staff can manage doctor queues, while administrators can monitor department-level queue statistics and notifications.

## Team

| Member | Role | Main Responsibilities | Technologies / Tools Used |
|---|---|---|---|
| **Member 1 — [Ankit patel]** | Backend & Database | Authentication, backend APIs, queue/business logic, database integration, realtime backend, seed/demo data | **Node.js, Express, Socket.IO, PostgreSQL 16, Prisma, JWT, bcrypt, Docker** |
| **Member 2 — [Sweta jha ]** | Patient Frontend & Shared Frontend Foundation | Patient-facing flows, frontend foundation, API/auth/socket utilities, mock fixtures and shared patient-side functionality | **React 18, Vite, Tailwind CSS, shadcn/ui, React Router, JavaScript, Socket.IO client** |
| **Member 3 — [Aryan choudhary]** | Staff & Admin Frontend | Staff login/role guard, doctor queue panel, queue actions, realtime queue updates, admin dashboard, statistics, charts, notification/SMS log, simulator controls | **React 18, Vite, Tailwind CSS, shadcn/ui, React Router, JavaScript, Lucide React, Recharts, Socket.IO client** |

> **Team structure:** The project documentation defines four implementation roles, but this hackathon team is working with three members. The three-member mapping above covers the active responsibilities used by the team.

## Key Features

### Patient
- Mobile + OTP-based registration/login
- Book an appointment slot or join a live OPD queue
- Digital token with QR code
- Live queue position and estimated waiting time
- Notification when approximately three patients are ahead

### Staff / Doctor
- Staff login and role-based access
- Current patient display
- Waiting queue with token and patient information
- Call Next
- Skip / requeue
- No-show
- Complete consultation
- Queue counters and status
- Realtime updates with polling fallback
- Keyboard shortcuts for common queue actions

### Admin
- Protected admin dashboard
- Total waiting / consultation / completed / no-show KPIs
- Department-wise queue statistics
- Average wait and longest wait information
- Active doctor and load metrics
- Queue/load charts using Recharts
- Realtime dashboard updates
- Simulated SMS/notification log
- Simulator start/stop controls and demo reset

## Technology Stack

### Frontend
- React 18
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- JavaScript / JSX
- Lucide React
- Recharts
- Socket.IO client

### Backend
- Node.js
- Express
- Socket.IO
- Prisma ORM
- PostgreSQL 16
- JWT authentication
- bcrypt/bcryptjs for password hashing
- Docker for local database development

### Project Structure

```text
Mediqueue/
├── apps/
│   ├── web/                 # React/Vite frontend
│   │   └── src/
│   │       ├── components/  # Shared UI components
│   │       ├── hooks/       # Frontend queue/admin hooks
│   │       ├── lib/         # API/auth/socket utilities
│   │       ├── mocks/       # Contract-compatible demo data
│   │       ├── pages/
│   │       │   ├── patient/
│   │       │   ├── staff/
│   │       │   └── admin/
│   │       └── ...
│   │
│   └── server/              # Node/Express backend
│       ├── prisma/          # Prisma schema, migrations and seed
│       └── src/
│
├── packages/
│   └── shared/              # Shared constants/contracts
│
├── API_CONTRACT.md
├── DATABASE_SCHEMA.md
├── FINAL_PROJECT_STRUCTURE.md
├── MVP_CHECKLIST.md
├── SOCKET_CONTRACT.md
├── TEAM_TASKS.md
└── README.md
```

## Realtime Architecture

MediQueue uses **Socket.IO** for realtime queue and dashboard events.

Examples include:
- `queue:update` — updates staff queue state
- `stats:update` — refreshes admin statistics
- `notification:new` — adds a new notification/SMS entry
- `simulator:status` — updates simulator state
- `demo:reset` — resets the demo state

The frontend also supports polling as a fallback when a realtime connection is unavailable.

## API Areas

The Staff/Admin frontend integrates with backend endpoints for:

- Staff/Admin authentication
- Doctor queue retrieval
- Call Next
- Skip
- No-show
- Complete consultation
- Admin statistics
- Admin notifications/SMS log
- Simulator status and controls

The API contract uses camelCase JSON responses and the project database uses PostgreSQL with Prisma.

## Development Setup

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Mediqueue
```

### 2. Start the database

Make sure Docker Desktop is running, then use the project's database command:

```bash
npm run db:up
```

### 3. Run migrations and seed demo data

```bash
npm run db:migrate
npm run db:seed
```

### 4. Start the backend

```bash
npm run dev:server
```

### 5. Start the frontend

```bash
npm run dev:web
```

> Use the exact script names present in the repository's current `package.json` if they differ.

## Frontend Modes

During early development the frontend can use contract-compatible mock data.

Set:

```env
VITE_USE_MOCKS=true
```

For real backend integration:

```env
VITE_USE_MOCKS=false
```

The frontend should only contain public client-side environment values. Database credentials, JWT secrets, and other backend secrets must remain on the server side.

## Branches

The team's main working branches are:

```text
main
backend
patient-frontend
staff+admin-frontend
```

Each member works on their assigned branch and changes are merged into `main` through the team's Git workflow.

## Hackathon MVP Focus

The core implementation prioritizes:
1. Patient registration and queue/appointment flow
2. Staff queue management
3. Live queue position and estimated wait
4. Admin queue/department monitoring
5. Realtime updates
6. Three-turn notification
7. Demo data covering multiple departments and 30+ patients

## Project Goals

MediQueue is designed to reduce OPD waiting uncertainty by giving patients live queue visibility while helping staff and administrators manage patient flow from a single system.

---

### Contributors

**Member 1 — [Ankit patel]**  
Backend / Database / Realtime

**Member 2 — [Sweta jha ]**  
Patient Frontend / Shared Frontend Foundation

**Member 3 — [Aryan choudhary]**  
Staff / Admin Frontend
