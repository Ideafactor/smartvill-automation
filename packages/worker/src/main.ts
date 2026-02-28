import 'dotenv/config';
import pino from 'pino';
import { startInvoiceWorker } from './workers/invoiceWorker';
import { startCertificateWorker } from './workers/certificateWorker';

const logger = pino({
  name: 'worker-main',
  level: process.env.LOG_LEVEL ?? 'info',
});

async function main() {
  logger.info('Starting SmartBill worker processes');

  const invoiceWorker = startInvoiceWorker();
  const certificateWorker = startCertificateWorker();

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down workers gracefully...');

    await Promise.all([
      invoiceWorker.close(),
      certificateWorker.close(),
    ]);

    logger.info('All workers closed');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info('Workers ready and listening for jobs');
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start workers');
  process.exit(1);
});
