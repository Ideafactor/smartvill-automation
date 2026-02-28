import { Page } from 'playwright';
import pino from 'pino';

const logger = pino({ name: 'SmartBillLoginPage' });

const BASE_URL = process.env.SMARTBILL_BASE_URL ?? 'https://www.smartbill.co.kr';

export class SmartBillLoginPage {
  constructor(private readonly page: Page) {}

  async navigate(): Promise<void> {
    logger.info('Navigating to SmartBill login page');
    await this.page.goto(`${BASE_URL}/login`, {
      waitUntil: 'networkidle',
    });
  }

  async loginWithId(loginId: string, password: string): Promise<void> {
    logger.info({ loginId }, 'Attempting ID/password login');

    // Wait for login form
    await this.page.waitForSelector('form', { timeout: 15_000 });

    // Fill credentials using semantic locators
    await this.page.getByLabel('아이디').fill(loginId);
    await this.page.getByLabel('비밀번호').fill(password);

    // Submit
    await this.page.getByRole('button', { name: /로그인/i }).click();

    // Wait for navigation or error
    await Promise.race([
      this.page.waitForURL(/dashboard|main|home/i, { timeout: 15_000 }),
      this.page.waitForSelector('[class*="error"], [class*="alert"]', {
        timeout: 15_000,
      }),
    ]);

    await this.assertLoggedIn();
    logger.info({ loginId }, 'Login successful');
  }

  async loginWithCertificate(certPassword: string): Promise<void> {
    logger.info('Attempting certificate-based login');

    // Click the certificate login tab
    await this.page
      .getByRole('tab', { name: /공동인증서|공인인증서/i })
      .click();

    // Wait for certificate list to load
    await this.page.waitForSelector('[class*="cert"], [class*="certificate"]', {
      timeout: 10_000,
    });

    // Select first available certificate
    await this.page.getByRole('listitem').first().click();

    // Enter certificate password
    await this.page.getByLabel(/비밀번호|패스워드/i).fill(certPassword);

    await this.page
      .getByRole('button', { name: /확인|로그인/i })
      .last()
      .click();

    await this.assertLoggedIn();
    logger.info('Certificate login successful');
  }

  private async assertLoggedIn(): Promise<void> {
    const errorLocator = this.page.locator('[class*="error"]:visible, [class*="alert"]:visible');
    const hasError = await errorLocator.count() > 0;

    if (hasError) {
      const errorText = await errorLocator.first().textContent();
      throw new Error(`Login failed: ${errorText}`);
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.waitForSelector(
        '[class*="logout"], [aria-label*="로그아웃"]',
        { timeout: 5_000 },
      );
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.page
        .getByRole('button', { name: /로그아웃/i })
        .click({ timeout: 5_000 });
      logger.info('Logged out successfully');
    } catch {
      logger.warn('Logout button not found, skipping');
    }
  }
}
