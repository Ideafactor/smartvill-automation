import { Page } from 'playwright';
import pino from 'pino';

const logger = pino({ name: 'CertificatePage' });

const BASE_URL = process.env.SMARTBILL_BASE_URL ?? 'https://www.smartbill.co.kr';

export interface CertificateInfo {
  subjectDn: string;
  issuerDn: string;
  serialNumber: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'expired' | 'invalid';
}

export class CertificatePage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    logger.info('Navigating to certificate management page');
    await this.page.goto(`${BASE_URL}/certificate/list`, {
      waitUntil: 'networkidle',
    });
  }

  async getCertificates(): Promise<CertificateInfo[]> {
    logger.info('Fetching certificate list');
    await this.navigate();

    // Wait for certificate table/list
    await this.page.waitForSelector('table, [class*="cert-list"]', {
      timeout: 15_000,
    });

    const certificates: CertificateInfo[] = [];

    const rows = await this.page.locator('tr[data-cert-id], [class*="cert-item"]').all();
    for (const row of rows) {
      try {
        const subjectDn = (await row.locator('[class*="subject"], td:nth-child(1)').textContent()) ?? '';
        const validTo = (await row.locator('[class*="valid-to"], td:nth-child(3)').textContent()) ?? '';

        const now = new Date();
        const expiryDate = new Date(validTo.trim());
        const status = expiryDate > now ? 'active' : 'expired';

        certificates.push({
          subjectDn: subjectDn.trim(),
          issuerDn: '',
          serialNumber: '',
          validFrom: '',
          validTo: validTo.trim(),
          status,
        });
      } catch (err) {
        logger.warn({ err }, 'Failed to parse certificate row');
      }
    }

    logger.info({ count: certificates.length }, 'Certificates retrieved');
    return certificates;
  }

  async registerCertificate(certFilePath: string, certPassword: string): Promise<void> {
    logger.info('Registering new certificate');
    await this.navigate();

    // Click register button
    await this.page.getByRole('button', { name: /인증서 등록|등록/i }).click();

    // Wait for file input
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.waitFor({ timeout: 10_000 });
    await fileInput.setInputFiles(certFilePath);

    // Enter password
    await this.page.getByLabel(/비밀번호/i).fill(certPassword);

    // Confirm
    await this.page.getByRole('button', { name: /확인|등록/i }).last().click();

    // Wait for success
    await this.page.waitForSelector('[class*="success"], [class*="완료"]', {
      timeout: 15_000,
    });

    logger.info('Certificate registered successfully');
  }
}
