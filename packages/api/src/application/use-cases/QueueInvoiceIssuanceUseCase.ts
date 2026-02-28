import { Queue } from 'bullmq';
import { z } from 'zod';
import { InvoiceIssuePayload } from '../../domain/models/Job';

const invoiceIssueSchema = z.object({
  accountId: z.string().uuid(),
  invoiceData: z.object({
    buyerBusinessNumber: z.string().regex(/^\d{10}$/, '사업자등록번호 10자리'),
    buyerName: z.string().min(1),
    buyerEmail: z.string().email(),
    supplyAmount: z.number().positive(),
    taxAmount: z.number().nonnegative(),
    totalAmount: z.number().positive(),
    itemName: z.string().min(1),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식'),
  }),
});

export class QueueInvoiceIssuanceUseCase {
  constructor(private readonly queue: Queue) {}

  async execute(
    tenantId: string,
    input: unknown,
  ): Promise<{ jobId: string }> {
    const parsed = invoiceIssueSchema.safeParse(input);
    if (!parsed.success) {
      throw Object.assign(new Error('Validation failed'), {
        statusCode: 400,
        details: parsed.error.issues,
      });
    }

    const payload: InvoiceIssuePayload & { tenantId: string } = {
      tenantId,
      ...parsed.data,
    };

    const job = await this.queue.add('invoice-issue', payload, {
      jobId: `invoice-${tenantId}-${Date.now()}`,
    });

    return { jobId: job.id! };
  }
}
