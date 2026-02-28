export type JobType = 'invoice-issue' | 'certificate-sync';

export type JobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused';

export interface Job {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  errorMessage?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceIssuePayload {
  accountId: string;
  invoiceData: {
    buyerBusinessNumber: string; // 공급받는자 사업자번호
    buyerName: string;
    buyerEmail: string;
    supplyAmount: number; // 공급가액
    taxAmount: number;   // 세액
    totalAmount: number; // 합계금액
    itemName: string;    // 품목
    issueDate: string;   // 작성일자 (YYYY-MM-DD)
  };
}

export interface CertificateSyncPayload {
  accountId: string;
  certificatePath: string; // 공동인증서 파일 경로
  certificatePassword: string;
}
