import { Worker, Job } from 'bullmq';
import pino from 'pino';
import { createBullMQConnection } from '../infrastructure/redis';
import { createBrowserSession, closeBrowserSession } from '../automation/playwright/browser';
import { SmartBillLoginPage } from '../automation/playwright/pages/SmartBillLoginPage';
import { InvoiceIssuePage } from '../automation/playwright/pages/InvoiceIssuePage';
import { getTenantClient } from '../infrastructure/database';

const logger = pino({ name: 'invoice-worker' });

interface InvoiceJobPayload {
  tenantId: string;
  accountId: string;
  invoiceData: {
    buyerBusinessNumber: string;
    buyerName: string;
    buyerEmail: string;
    supplyAmount: number;
    taxAmount: number;
    totalAmount: number;
    itemName: string;
    issueDate: string;
  };
}

async function processInvoiceJob(job: Job<InvoiceJobPayload>): Promise<void> {
  const { tenantId, accountId, invoiceData } = job.data;
  const jobId = job.id ?? 'unknown';

  logger.info({ jobId, tenantId, accountId }, 'Starting invoice issuance job');

  // Fetch account credentials from DB
  const client = await getTenantClient(tenantId);
  let loginId: string;
  let loginPassword: string;

  try {
    const result = await client.query<{ login_id: string; login_password: string }>(
      'SELECT login_id, login_password FROM accounts WHERE id = $1 AND is_active = true',
      [accountId],
    );

    if (result.rows.length === 0) {
      throw new Error(`Account ${accountId} not found or inactive`);
    }

    loginId = result.rows[0].login_id;
    loginPassword = result.rows[0].login_password;
  } finally {
    client.release();
  }

  // Create isolated browser session
  const session = await createBrowserSession(jobId);

  try {
    await job.updateProgress(10);

    // Login
    const loginPage = new SmartBillLoginPage(session.page);
    await loginPage.navigate();
    await loginPage.loginWithId(loginId, loginPassword);

    await job.updateProgress(30);

    // Issue invoice
    const invoicePage = new InvoiceIssuePage(session.page);
    const result = await invoicePage.issueInvoice(invoiceData);

    await job.updateProgress(90);

    if (!result.success) {
      throw new Error(`Invoice issuance failed: ${result.errorMessage}`);
    }

    // Record transaction in DB
    const dbClient = await getTenantClient(tenantId);
    try {
      await dbClient.query(
        `INSERT INTO transactions (job_id, account_id, type, status, payload, result, issued_at)
         VALUES ($1, $2, 'invoice-issue', 'completed', $3, $4, $5)`,
        [
          jobId,
          accountId,
          JSON.stringify(invoiceData),
          JSON.stringify(result),
          result.issuedAt ? new Date(result.issuedAt) : new Date(),
        ],
      );

      // Update job status in jobs table
      await dbClient.query(
        `INSERT INTO jobs (id, type, status, payload, result, attempts)
         VALUES ($1, 'invoice-issue', 'completed', $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET status = 'completed', result = $3, attempts = $4, updated_at = NOW()`,
        [jobId, JSON.stringify(job.data), JSON.stringify(result), job.attemptsMade],
      );
    } finally {
      dbClient.release();
    }

    await job.updateProgress(100);
    logger.info({ jobId, tenantId, invoiceNumber: result.invoiceNumber }, 'Invoice issued successfully');
  } finally {
    await closeBrowserSession(session, jobId);
  }
}

export function startInvoiceWorker(): Worker {
  const worker = new Worker<InvoiceJobPayload>(
    'smartbill:invoice-issue',
    processInvoiceJob,
    {
      connection: createBullMQConnection(),
      concurrency: 2, // Max 2 concurrent invoice jobs per worker instance
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Invoice job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Invoice job failed');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Invoice job stalled');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Invoice worker error');
  });

  logger.info('Invoice worker started');
  return worker;
}
