import { Queue } from 'bullmq';
import { JobStatus } from '../../domain/models/Job';

interface JobStatusResult {
  jobId: string;
  type: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  failedReason?: string;
  returnValue?: unknown;
  createdAt: Date;
  processedAt?: Date;
  finishedAt?: Date;
}

export class GetJobStatusUseCase {
  constructor(
    private readonly invoiceQueue: Queue,
    private readonly certQueue: Queue,
  ) {}

  async execute(
    jobId: string,
    type?: 'invoice-issue' | 'certificate-sync',
  ): Promise<JobStatusResult | null> {
    // Try to find job in specified queue, or both
    const queues = type === 'invoice-issue'
      ? [this.invoiceQueue]
      : type === 'certificate-sync'
      ? [this.certQueue]
      : [this.invoiceQueue, this.certQueue];

    for (const queue of queues) {
      const job = await queue.getJob(jobId);
      if (!job) continue;

      const state = await job.getState();
      const progress = typeof job.progress === 'number' ? job.progress : 0;

      return {
        jobId: job.id!,
        type: job.name,
        status: state as JobStatus,
        progress,
        attempts: job.attemptsMade,
        failedReason: job.failedReason,
        returnValue: job.returnvalue,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      };
    }

    return null;
  }
}
