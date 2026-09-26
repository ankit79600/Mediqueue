// Contract-shaped fixture data, enabled by VITE_USE_MOCKS=true.
// Field names/shapes copied verbatim from API_CONTRACT.md §2 (one example per
// shared object). Values are synthetic and loosely follow the seed data in
// DATABASE_SCHEMA.md §7 (depts GM/PED/ORT/GYN, dr.<name>/demo123, admin/admin123).
// TEAM_TASKS.md B2: "Fixture = contract example, byte-for-byte" — keep in sync
// with API_CONTRACT.md if the contract changes.

export const doctors = [
  {
    id: 'doc-gm-1',
    departmentId: 'dept-gm',
    name: 'Dr. A. Sen',
    room: 'OPD-01',
    isActive: true,
    avgConsultMin: 7.5,
    queueLength: 9,
    currentTokenNo: 'GM-011',
  },
  {
    id: 'doc-ped-1',
    departmentId: 'dept-ped',
    name: 'Dr. R. Iyer',
    room: 'OPD-03',
    isActive: true,
    avgConsultMin: 6.2,
    queueLength: 5,
    currentTokenNo: 'PED-006',
  },
];

export const departments = [
  {
    id: 'dept-gm',
    name: 'General Medicine',
    code: 'GM',
    queueLength: 17,
    estimatedWaitMin: 42,
    doctors: [doctors[0]],
  },
  {
    id: 'dept-ped',
    name: 'Paediatrics',
    code: 'PED',
    queueLength: 9,
    estimatedWaitMin: 24,
    doctors: [doctors[1]],
  },
];

export const currentToken = {
  id: 'tok-gm-011',
  tokenNo: 'GM-011',
  status: 'CALLED',
  priority: 'NONE',
  departmentName: 'General Medicine',
  doctorName: 'Dr. A. Sen',
  room: 'OPD-01',
  position: 0,
  peopleAhead: null,
  estimatedWaitMin: null,
  estimatedCallAt: null,
  updatedAt: new Date().toISOString(),
  type: 'LIVE',
  departmentId: 'dept-gm',
  doctorId: 'doc-gm-1',
  slotId: null,
  slotTime: null,
  serviceDate: new Date().toISOString().slice(0, 10),
  patient: { id: 'pat-1', name: 'Riya Das', phoneMasked: '98XXXXXX10', age: 34 },
  createdAt: new Date().toISOString(),
  calledAt: new Date().toISOString(),
  endedAt: null,
  skipCount: 0,
  notifiedThreeAway: true,
  etaSource: 'AVG',
  trackUrl: 'http://localhost:5173/t/tok-gm-011?s=abcdef1234567890',
  qrPayload: 'http://localhost:5173/t/tok-gm-011?s=abcdef1234567890',
};

export const waitingTokens = [
  {
    ...currentToken,
    id: 'tok-gm-012',
    tokenNo: 'GM-012',
    status: 'WAITING',
    position: 1,
    peopleAhead: 0,
    estimatedWaitMin: 8,
    estimatedCallAt: new Date(Date.now() + 8 * 60000).toISOString(),
    calledAt: null,
    patient: { id: 'pat-2', name: 'Aman Gupta', phoneMasked: '98XXXXXX22', age: 45 },
  },
  {
    ...currentToken,
    id: 'tok-gm-013',
    tokenNo: 'GM-013',
    status: 'WAITING',
    priority: 'ELDERLY',
    position: 2,
    peopleAhead: 1,
    estimatedWaitMin: 16,
    estimatedCallAt: new Date(Date.now() + 16 * 60000).toISOString(),
    calledAt: null,
    patient: { id: 'pat-3', name: 'Sunita Rao', phoneMasked: '98XXXXXX33', age: 68 },
  },
];

export const queueSnapshot = {
  doctor: doctors[0],
  department: { id: 'dept-gm', name: 'General Medicine', code: 'GM' },
  current: currentToken,
  waiting: waitingTokens,
  stats: { servedToday: 12, noShowToday: 1, waitingCount: waitingTokens.length, avgConsultMin: 7.5 },
  generatedAt: new Date().toISOString(),
};

export const displaySnapshot = {
  department: { id: 'dept-gm', name: 'General Medicine', code: 'GM' },
  nowServing: [{ doctorId: 'doc-gm-1', doctorName: 'Dr. A. Sen', room: 'OPD-01', tokenNo: 'GM-011' }],
  upNext: [{ tokenNo: 'GM-012', doctorName: 'Dr. A. Sen', room: 'OPD-01', priority: 'NONE' }],
  queueLength: 17,
  generatedAt: new Date().toISOString(),
};

export const adminStats = {
  serviceDate: new Date().toISOString().slice(0, 10),
  totals: {
    waiting: 38,
    inConsultation: 5,
    completedToday: 61,
    noShowToday: 4,
    cancelledToday: 2,
    avgWaitMin: 23.4,
    activeDoctors: 6,
  },
  departments: [
    {
      departmentId: 'dept-gm',
      name: 'General Medicine',
      code: 'GM',
      queueLength: 17,
      inConsultation: 2,
      completedToday: 25,
      noShowToday: 2,
      avgWaitMin: 31.2,
      avgConsultMin: 7.8,
      activeDoctors: 2,
      loadPerDoctor: 8.5,
      longestWaitMin: 64,
    },
    {
      departmentId: 'dept-ped',
      name: 'Paediatrics',
      code: 'PED',
      queueLength: 9,
      inConsultation: 1,
      completedToday: 18,
      noShowToday: 1,
      avgWaitMin: 19.5,
      avgConsultMin: 6.2,
      activeDoctors: 2,
      loadPerDoctor: 4.5,
      longestWaitMin: 30,
    },
  ],
  hourly: [
    { hour: '09:00', arrivals: 22, completed: 15 },
    { hour: '10:00', arrivals: 18, completed: 20 },
  ],
  generatedAt: new Date().toISOString(),
};

export const notifications = [
  {
    id: 'notif-1',
    tokenId: 'tok-gm-013',
    tokenNo: 'GM-013',
    kind: 'THREE_AWAY',
    channel: 'SMS_SIMULATED',
    toPhoneMasked: '98XXXXXX33',
    message: 'MediQueue: GM-013, you are 3rd in line for Dr. A. Sen (OPD-01). Est. wait 16 min.',
    status: 'SENT',
    createdAt: new Date().toISOString(),
  },
];

export const simulatorStatus = {
  running: false,
  speed: 10,
  startedAt: null,
  tokensCreated: 0,
  actionsPerformed: 0,
};

export const staffLoginResponse = {
  accessToken: 'mock.jwt.staff',
  expiresIn: 43200,
  staff: { id: 'staff-1', name: 'Dr. A. Sen', role: 'STAFF', doctorId: 'doc-gm-1', departmentId: 'dept-gm' },
};

export const adminLoginResponse = {
  accessToken: 'mock.jwt.admin',
  expiresIn: 43200,
  staff: { id: 'staff-admin', name: 'Admin', role: 'ADMIN', doctorId: null, departmentId: null },
};
