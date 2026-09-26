import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/error.js';
import { ErrorCode, SOCKET_EVENTS, rooms } from '@mediqueue/shared';
import config from '../config.js';
import { getHospitalDate } from '../utils.js';
import { buildAdminStats } from '../services/stats.service.js';
import { getNotifications } from '../services/notification.service.js';
import { getStatus, startSimulator, stopSimulator } from '../services/simulator.service.js';
import { resetDemo } from '../services/demo.service.js';
import { getIo } from '../realtime/io.js';

const router = Router();

// ─── E21  GET /admin/stats ────────────────────────────────────────────────────

router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const today = getHospitalDate();
    res.json(await buildAdminStats(today));
  } catch (err) {
    next(err);
  }
});

// ─── E22  GET /admin/notifications ───────────────────────────────────────────

const notifQuery = z.object({
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
});

router.get(
  '/notifications',
  requireAdmin,
  validate({ query: notifQuery }),
  async (req, res, next) => {
    try {
      const { limit, before = null } = req.query;
      res.json(await getNotifications({ limit, before }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── E23  GET /admin/simulator ────────────────────────────────────────────────

router.get('/simulator', requireAdmin, (req, res) => {
  res.json(getStatus());
});

// ─── E24  POST /admin/simulator ───────────────────────────────────────────────

const simulatorBody = z.object({
  action:         z.enum(['start', 'stop']),
  speed:          z.coerce.number().int().min(1).max(60).default(10),
  arrivalsPerMin: z.coerce.number().int().min(1).max(30).default(6),
});

router.post(
  '/simulator',
  requireAdmin,
  validate({ body: simulatorBody }),
  (req, res, next) => {
    try {
      const { action, speed, arrivalsPerMin } = req.body;
      const io = getIo();

      if (action === 'start') {
        startSimulator(io, { speed, arrivalsPerMin });
      } else {
        stopSimulator();
      }

      const status = getStatus();
      // T8: emit simulator:status to admin room
      io.to(rooms.admin()).emit(SOCKET_EVENTS.SIMULATOR_STATUS, status);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }
);

// ─── E25  POST /admin/demo/reset ──────────────────────────────────────────────

router.post('/demo/reset', requireAdmin, async (req, res, next) => {
  try {
    if (!config.DEMO_MODE) {
      return next(new AppError(403, ErrorCode.FORBIDDEN, 'Demo reset is only available in DEMO_MODE'));
    }
    res.json(await resetDemo(getIo()));
  } catch (err) {
    next(err);
  }
});

export default router;
