import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

/** A one-line, actionable message instead of a raw Playwright stack trace. */
export function describeScreenshotError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Executable doesn't exist") || msg.toLowerCase().includes('playwright install')) {
    return 'Playwright browser not installed. Run `npx playwright install chromium` and try again.';
  }
  return msg.split('\n')[0]!;
}

export async function captureScreenshot(url: string, outputPath: string): Promise<string> {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outputPath, fullPage: true });
    return outputPath;
  } finally {
    await browser.close();
  }
}
