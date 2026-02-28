import { Request, Response, NextFunction } from 'express';
import { QueueInvoiceIssuanceUseCase } from '../../../application/use-cases/QueueInvoiceIssuanceUseCase';
import { QueueCertificateSyncUseCase } from '../../../application/use-cases/QueueCertificateSyncUseCase';
import { GetJobStatusUseCase } from '../../../application/use-cases/GetJobStatusUseCase';
import { invoiceIssueQueue, certificateSyncQueue } from '../../../infrastructure/bullmq';

const queueInvoiceIssuance = new QueueInvoiceIssuanceUseCase(invoiceIssueQueue);
const queueCertificateSync = new QueueCertificateSyncUseCase(certificateSyncQueue);
const getJobStatus = new GetJobStatusUseCase(invoiceIssueQueue, certificateSyncQueue);

export async function enqueueInvoiceIssue(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const { jobId } = await queueInvoiceIssuance.execute(tenantId, req.body);

    res.status(202).json({
      jobId,
      status: 'waiting',
      message: 'Invoice issuance job queued successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function enqueueCertificateSync(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.tenantId!;
    const { jobId } = await queueCertificateSync.execute(tenantId, req.body);

    res.status(202).json({
      jobId,
      status: 'waiting',
      message: 'Certificate sync job queued successfully',
    });
  } catch (err) {
    next(err);
  }
}

export async function getJobStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { jobId } = req.params;
    const { type } = req.query as { type?: 'invoice-issue' | 'certificate-sync' };

    const status = await getJobStatus.execute(jobId, type);
    if (!status) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(status);
  } catch (err) {
    next(err);
  }
}
