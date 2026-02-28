import { Queue, QueueOptions } from 'bullmq';
import { createBullMQConnection } from './redis';

const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 60_000, // 1 minute initial delay
  },
  removeOnComplete: false,
  removeOnFail: false,
};

const queueOptions: QueueOptions = {
  connection: createBullMQConnection(),
  defaultJobOptions,
};

export const invoiceIssueQueue = new Queue(
  'smartbill:invoice-issue',
  queueOptions,
);

export const certificateSyncQueue = new Queue(
  'smartbill:certificate-sync',
  queueOptions,
);

export const QUEUE_NAMES = {
  INVOICE_ISSUE: 'smartbill:invoice-issue',
  CERTIFICATE_SYNC: 'smartbill:certificate-sync',
} as const;
