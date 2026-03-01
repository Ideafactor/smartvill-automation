import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { invoiceIssueQueue, certificateSyncQueue } from '../../../infrastructure/bullmq';

export function createBullBoardRouter() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/bull-board');

  createBullBoard({
    queues: [
      new BullMQAdapter(invoiceIssueQueue),
      new BullMQAdapter(certificateSyncQueue),
    ],
    serverAdapter,
  });

  return serverAdapter.getRouter();
}
