import { Queue } from 'bullmq';
import { z } from 'zod';
import { CertificateSyncPayload } from '../../domain/models/Job';

const certificateSyncSchema = z.object({
  accountId: z.string().uuid(),
  certificatePath: z.string().min(1),
  certificatePassword: z.string().min(1),
});

export class QueueCertificateSyncUseCase {
  constructor(private readonly queue: Queue) {}

  async execute(
    tenantId: string,
    input: unknown,
  ): Promise<{ jobId: string }> {
    const parsed = certificateSyncSchema.safeParse(input);
    if (!parsed.success) {
      throw Object.assign(new Error('Validation failed'), {
        statusCode: 400,
        details: parsed.error.issues,
      });
    }

    const payload: CertificateSyncPayload & { tenantId: string } = {
      tenantId,
      ...parsed.data,
    };

    const job = await this.queue.add('certificate-sync', payload, {
      jobId: `cert-${tenantId}-${Date.now()}`,
    });

    return { jobId: job.id! };
  }
}
