import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

// E1 — GET /health (API_CONTRACT §4)
router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString(), version: '1.0.0' });
  } catch (err) {
    console.error('[health] DB check failed:', err.message);
    res.status(500).json({ status: 'error', db: 'down', time: new Date().toISOString(), version: '1.0.0' });
  }
});

export default router;
