import { Page } from 'playwright';
import pino from 'pino';

const logger = pino({ name: 'InvoiceIssuePage' });

const BASE_URL = process.env.SMARTBILL_BASE_URL ?? 'https://www.smartbill.co.kr';

export interface InvoiceData {
  buyerBusinessNumber: string;
  buyerName: string;
  buyerEmail: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  itemName: string;
  issueDate: string; // YYYY-MM-DD
}

export interface InvoiceIssueResult {
  success: boolean;
  invoiceNumber?: string;
  issuedAt?: string;
  errorMessage?: string;
}

export class InvoiceIssuePage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    logger.info('Navigating to invoice issuance page');
    await this.page.goto(`${BASE_URL}/invoice/issue`, {
      waitUntil: 'networkidle',
    });
  }

  async issueInvoice(data: InvoiceData): Promise<InvoiceIssueResult> {
    logger.info({ buyerBusinessNumber: data.buyerBusinessNumber }, 'Starting invoice issuance');

    await this.navigate();

    // Wait for form to be ready
    await this.page.waitForSelector('form[name*="invoice"], [class*="invoice-form"]', {
      timeout: 15_000,
    });

    // ─── 공급받는자 정보 ───────────────────────────────────────────────────────
    await this.fillBuyerInfo(data);

    // ─── 품목 정보 ────────────────────────────────────────────────────────────
    await this.fillItemInfo(data);

    // ─── 작성일자 ─────────────────────────────────────────────────────────────
    await this.fillIssueDate(data.issueDate);

    // ─── 발행 ─────────────────────────────────────────────────────────────────
    return await this.submitInvoice();
  }

  private async fillBuyerInfo(data: InvoiceData): Promise<void> {
    // 공급받는자 사업자번호
    const bizNumInput = this.page.getByLabel(/공급받는자.*사업자번호|구매자.*사업자번호/i);
    await bizNumInput.fill(data.buyerBusinessNumber);
    await bizNumInput.press('Tab');

    // Wait for auto-complete or manual fill
    await this.page.waitForTimeout(500);

    // 상호 (company name - may auto-fill)
    const nameInput = this.page.getByLabel(/상호|회사명/i);
    const autoFilled = await nameInput.inputValue();
    if (!autoFilled) {
      await nameInput.fill(data.buyerName);
    }

    // 이메일
    const emailInput = this.page.getByLabel(/이메일|Email/i);
    await emailInput.fill(data.buyerEmail);
  }

  private async fillItemInfo(data: InvoiceData): Promise<void> {
    // 품목명
    await this.page.getByLabel(/품목|품명/i).fill(data.itemName);

    // 공급가액
    await this.page
      .getByLabel(/공급가액|공급 가액/i)
      .fill(data.supplyAmount.toLocaleString('ko-KR'));

    // 세액 (may auto-calculate)
    const taxInput = this.page.getByLabel(/세액/i);
    const autoTax = await taxInput.inputValue();
    if (!autoTax) {
      await taxInput.fill(data.taxAmount.toLocaleString('ko-KR'));
    }
  }

  private async fillIssueDate(issueDate: string): Promise<void> {
    const [year, month, day] = issueDate.split('-');
    const dateInput = this.page.getByLabel(/작성일자|발행일/i);

    // Try direct fill first
    await dateInput.fill(`${year}${month}${day}`);
    if (await dateInput.inputValue() === '') {
      // Fallback: type character by character
      await dateInput.type(`${year}${month}${day}`, { delay: 50 });
    }
  }

  private async submitInvoice(): Promise<InvoiceIssueResult> {
    // Click issue button
    await this.page.getByRole('button', { name: /발행|세금계산서 발행/i }).click();

    // Handle confirmation dialog
    await this.page.waitForSelector('[role="dialog"], [class*="modal"]', {
      timeout: 10_000,
    });
    await this.page
      .getByRole('button', { name: /확인|발행/i })
      .last()
      .click();

    // Wait for result
    try {
      const successSelector = '[class*="success"], [class*="완료"], [class*="발행완료"]';
      const errorSelector = '[class*="error"], [class*="실패"]';

      const result = await Promise.race([
        this.page.waitForSelector(successSelector, { timeout: 30_000 })
          .then(() => 'success' as const),
        this.page.waitForSelector(errorSelector, { timeout: 30_000 })
          .then(() => 'error' as const),
      ]);

      if (result === 'success') {
        // Extract invoice number if available
        const invoiceNum = await this.page
          .locator('[class*="invoice-number"], [class*="승인번호"]')
          .textContent()
          .catch(() => undefined);

        logger.info({ invoiceNumber: invoiceNum }, 'Invoice issued successfully');
        return {
          success: true,
          invoiceNumber: invoiceNum?.trim(),
          issuedAt: new Date().toISOString(),
        };
      } else {
        const errorText = await this.page
          .locator('[class*="error"]:visible')
          .first()
          .textContent();
        return { success: false, errorMessage: errorText?.trim() };
      }
    } catch {
      return { success: false, errorMessage: 'Timeout waiting for invoice result' };
    }
  }
}
