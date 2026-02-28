import { Worker, Job } from 'bullmq';
import pino from 'pino';
import { createBullMQConnection } from '../infrastructure/redis';
import { createBrowserSession, closeBrowserSession } from '../automation/playwright/browser';
import { SmartBillLoginPage } from '../automation/playwright/pages/SmartBillLoginPage';
import { CertificatePage } from '../automation/playwright/pages/CertificatePage';
import { getTenantClient } from '../infrastructure/database';

const logger = pino({ name: 'certificate-worker' });

interface CertificateSyncPayload {
  tenantId: string;
  accountId: string;
  certificatePath: string;
  certificatePassword: string;
}

async function processCertificateJob(job: Job<CertificateSyncPayload>): Promise<void> {
  const { tenantId, accountId, certificatePath, certificatePassword } = job.data;
  const jobId = job.id ?? 'unknown';

  logger.info({ jobId, tenantId, accountId }, 'Starting certificate sync job');

  // Fetch account credentials
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

  const session = await createBrowserSession(jobId);

  try {
    await job.updateProgress(10);

    // Login
    const loginPage = new SmartBillLoginPage(session.page);
    await loginPage.navigate();
    await loginPage.loginWithId(loginId, loginPassword);

    await job.updateProgress(30);

    // Sync certificates
    const certPage = new CertificatePage(session.page);

    // Register certificate if path provided
    if (certificatePath) {
      await certPage.registerCertificate(certificatePath, certificatePassword);
      await job.updateProgress(60);
    }

    // Fetch updated certificate list
    const certificates = await certPage.getCertificates();

    await job.updateProgress(80);

    // Upsert certificates in DB
    const dbClient = await getTenantClient(tenantId);
    try {
      for (const cert of certificates) {
        await dbClient.query(
          `INSERT INTO certificates (account_id, subject_dn, issuer_dn, serial_number,
            valid_from, valid_to, status, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (account_id, serial_number) DO UPDATE
           SET status = $7, valid_to = $6, updated_at = NOW()`,
          [
            accountId,
            cert.subjectDn,
            cert.issuerDn,
            cert.serialNumber || 'unknown',
            cert.validFrom || new Date().toISOString(),
            cert.validTo || new Date().toISOString(),
            cert.status,
            cert.fingerprint || '',
          ],
        );
      }

      // Update job record
      await dbClient.query(
        `INSERT INTO jobs (id, type, status, payload, result, attempts)
         VALUES ($1, 'certificate-sync', 'completed', $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET status = 'completed', result = $3, attempts = $4, updated_at = NOW()`,
        [
          jobId,
          JSON.stringify(job.data),
          JSON.stringify({ certificatesFound: certificates.length }),
          job.attemptsMade,
        ],
      );
    } finally {
      dbClient.release();
    }

    await job.updateProgress(100);
    logger.info({ jobId, tenantId, count: certificates.length }, 'Certificate sync completed');
  } finally {
    await closeBrowserSession(session, jobId);
  }
}

export function startCertificateWorker(): Worker {
  const worker = new Worker<CertificateSyncPayload>(
    'smartbill:certificate-sync',
    processCertificateJob,
    {
      connection: createBullMQConnection(),
      concurrency: 1, // Certificate operations are sensitive; limit concurrency
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Certificate job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Certificate job failed');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Certificate job stalled');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Certificate worker error');
  });

  logger.info('Certificate worker started');
  return worker;
}
