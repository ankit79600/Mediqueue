import config from './config.js';

/**
 * Returns midnight-UTC Date whose calendar date equals today in HOSPITAL_TZ.
 * Used everywhere service_date must be the hospital's local date.
 */
export function getHospitalDate() {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.HOSPITAL_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // "YYYY-MM-DD"
  return new Date(iso);  // midnight UTC for that date
}

/**
 * Masks the last 6 of a 10-digit phone number.
 * "9876543210" → "98XXXXXX10"
 */
export function maskPhone(phone) {
  if (!phone) return null;
  return phone.slice(0, 2) + 'XXXXXX' + phone.slice(-2);
}
