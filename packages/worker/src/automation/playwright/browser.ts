import { chromium, Browser, BrowserContext, Page } from 'playwright';
import pino from 'pino';

const logger = pino({ name: 'browser' });

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Create a fully isolated browser context for a single job.
 * Each job gets its own context to prevent session/cookie leakage.
 */
export async function createBrowserSession(jobId: string): Promise<BrowserSession> {
  logger.info({ jobId }, 'Creating browser session');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  });

  // Block unnecessary resources to speed up automation
  await context.route(
    /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp4|mp3|avi)(\?.*)?$/i,
    (route) => route.abort(),
  );

  // Block ad/analytics scripts
  await context.route(
    /googlesyndication|googletagmanager|analytics|facebook\.net|doubleclick/i,
    (route) => route.abort(),
  );

  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  logger.info({ jobId }, 'Browser session created');
  return { browser, context, page };
}

/**
 * Safely close browser session. Always call in a finally block.
 */
export async function closeBrowserSession(
  session: BrowserSession,
  jobId: string,
): Promise<void> {
  try {
    await session.context.close();
    await session.browser.close();
    logger.info({ jobId }, 'Browser session closed');
  } catch (err) {
    logger.warn({ jobId, err }, 'Error closing browser session');
  }
}
