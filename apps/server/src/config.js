import dotenv from 'dotenv';
dotenv.config(); // loads .env before zod validation runs; silent if file absent

import { z } from 'zod';

const schema = z.object({
  DATABASE_URL:      z.string().min(1, 'DATABASE_URL is required'),
  PORT:              z.coerce.number().int().positive().default(4000),
  NODE_ENV:          z.enum(['development', 'production', 'test']).default('development'),

  JWT_SECRET:        z.string().min(8, 'JWT_SECRET is required'),
  JWT_TTL_PATIENT:   z.string().default('12h'),
  JWT_TTL_STAFF:     z.string().default('12h'),

  OTP_PEPPER:        z.string().min(8, 'OTP_PEPPER is required'),
  QR_SECRET:         z.string().min(8, 'QR_SECRET is required'),
  KIOSK_KEY:         z.string().min(1, 'KIOSK_KEY is required'),

  DEMO_MODE:         z.string().transform(v => v === 'true').default('false'),
  SMS_MODE:          z.enum(['simulated', 'twilio']).default('simulated'),

  // Twilio — only required when SMS_MODE=twilio; validated later in notification.service
  TWILIO_SID:        z.string().optional(),
  TWILIO_TOKEN:      z.string().optional(),
  TWILIO_FROM:       z.string().optional(),

  HOSPITAL_TZ:       z.string().default('Asia/Kolkata'),
  PUBLIC_WEB_URL:    z.string().min(1).default('http://localhost:5173'),
  CORS_ORIGIN:       z.string().min(1).default('http://localhost:5173'),

  ML_MODEL_PATH:     z.string().default('../../ml/model.json'),
  ETA_TICK_MS:       z.coerce.number().int().positive().default(30000),
  SIMULATOR_BASE_URL: z.string().optional(),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Missing or invalid environment variables:');
  for (const issue of result.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export default result.data;
