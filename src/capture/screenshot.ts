import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

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
