import http from 'http';
import config from './config.js';
import app from './app.js';
import prisma from './db.js';
import { initIo } from './realtime/io.js';

const server = http.createServer(app);
initIo(server);

server.listen(config.PORT, () => {
  console.log(`[server] listening on port ${config.PORT} (${config.NODE_ENV})`);
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
// Gives in-flight requests time to complete before the process exits.
// Prisma is explicitly disconnected so the connection pool is cleaned up.

async function shutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('[server] database disconnected, goodbye');
    } catch (err) {
      console.error('[server] error during DB disconnect:', err.message);
    }
    process.exit(0);
  });

  // Force exit after 10 s if the server hasn't closed by then
  setTimeout(() => {
    console.error('[server] graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
