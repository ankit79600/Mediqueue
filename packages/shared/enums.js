// DATABASE_SCHEMA §2 — all enum values as frozen objects.
// Import these everywhere instead of hard-coding strings.

export const Role = Object.freeze({
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
});

export const Gender = Object.freeze({
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
});

export const TokenType = Object.freeze({
  SLOT: 'SLOT',
  LIVE: 'LIVE',
  KIOSK: 'KIOSK',
});

export const Priority = Object.freeze({
  NONE: 'NONE',
  ELDERLY: 'ELDERLY',
  PREGNANT: 'PREGNANT',
  EMERGENCY: 'EMERGENCY',
});

export const TokenStatus = Object.freeze({
  WAITING: 'WAITING',
  CALLED: 'CALLED',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW',
  CANCELLED: 'CANCELLED',
});

export const QueueAction = Object.freeze({
  CREATED: 'CREATED',
  CALLED: 'CALLED',
  SKIPPED: 'SKIPPED',
  NO_SHOW: 'NO_SHOW',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NOTIFIED_THREE_AWAY: 'NOTIFIED_THREE_AWAY',
});

export const ActorType = Object.freeze({
  PATIENT: 'PATIENT',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
  KIOSK: 'KIOSK',
  SYSTEM: 'SYSTEM',
  SIMULATOR: 'SIMULATOR',
});

export const NotificationKind = Object.freeze({
  TOKEN_CREATED: 'TOKEN_CREATED',
  THREE_AWAY: 'THREE_AWAY',
  CALLED: 'CALLED',
  SKIPPED: 'SKIPPED',
  NO_SHOW: 'NO_SHOW',
});

export const NotificationChannel = Object.freeze({
  IN_APP: 'IN_APP',
  SMS_SIMULATED: 'SMS_SIMULATED',
  SMS_TWILIO: 'SMS_TWILIO',
});

export const NotificationStatus = Object.freeze({
  SENT: 'SENT',
  FAILED: 'FAILED',
});
