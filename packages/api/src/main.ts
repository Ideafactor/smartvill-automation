import 'dotenv/config';
import { createServer, logger } from './infrastructure/server';
import { pool } from './infrastructure/database';
import { redis } from './infrastructure/redis';
import { registerRoutes } from './interfaces/http/routes';

const PORT = Number(process.env.API_PORT ?? 3000);

async function main() {
  const app = createServer();

  // ─── Register Routes ────────────────────────────────────────────────────────
  registerRoutes(app);

  // ─── Start Server ───────────────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API server started');
  });

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully...');
    server.close(async () => {
      await pool.end();
      await redis.quit();
      logger.info('Server closed');
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
