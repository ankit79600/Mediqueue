import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import healthRoutes from './routes/health.routes.js';

import authRoutes    from './routes/auth.routes.js';
import patientRoutes from './routes/patient.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import tokenRoutes   from './routes/token.routes.js';
import publicRoutes  from './routes/public.routes.js';
import kioskRoutes   from './routes/kiosk.routes.js';
import staffRoutes   from './routes/staff.routes.js';
import adminRoutes   from './routes/admin.routes.js';

const app = express();

// Trust first proxy so req.ip is correct behind Render's load balancer
app.set('trust proxy', 1);

// ─── SECURITY ─────────────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Kiosk-Key', 'X-Actor'],
  credentials: false, // Bearer header is used, not cookies
}));

// ─── REQUEST LOGGER ───────────────────────────────────────────────────────────
// Logs every request after the response is sent; skips /health to avoid noise.
app.use((req, res, next) => {
  if (req.path === '/api/v1/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms  = Date.now() - start;
    const lvl = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${lvl}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
// express.json() runs before rate limiters so req.body.phone is available for
// per-phone OTP rate limiting in auth.routes.js.
app.use(express.json());

// ─── ROUTES ───────────────────────────────────────────────────────────────────
// All REST endpoints live under /api/v1 (API_CONTRACT §1).
app.use('/api/v1', healthRoutes);

app.use('/api/v1/auth',    authRoutes);
app.use('/api/v1',         patientRoutes);
app.use('/api/v1',         catalogRoutes);
app.use('/api/v1',         tokenRoutes);
app.use('/api/v1/public',  publicRoutes);
app.use('/api/v1/kiosk',   kioskRoutes);
app.use('/api/v1/staff',   staffRoutes);
app.use('/api/v1/admin',   adminRoutes);

// ─── FALLBACKS ────────────────────────────────────────────────────────────────
app.use(notFoundHandler); // 404 for unknown routes
app.use(errorHandler);    // converts AppError / unhandled errors → JSON envelope

export default app;
