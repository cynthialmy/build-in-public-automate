import { mkdirSync, existsSync } from 'fs';
import type { Browser, BrowserContext, Page } from 'playwright';

interface RecordingSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  videoDir: string;
}

let activeSession: RecordingSession | null = null;

export async function startRecording(url: string, videoDir: string): Promise<void> {
  if (activeSession) {
    throw new Error('A recording session is already active.');
  }

  if (!existsSync(videoDir)) {
    mkdirSync(videoDir, { recursive: true });
  }

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    recordVideo: { dir: videoDir },
  });
  const page = await context.newPage();
  await page.goto(url);

  activeSession = { browser, context, page, videoDir };
}

export async function stopRecording(): Promise<string | undefined> {
  if (!activeSession) {
    throw new Error('No active recording session.');
  }

  const { page, context, browser } = activeSession;

  // Close the page — this triggers video save
  const videoPath = await page.video()?.path();
  await page.close();
  await context.close();
  await browser.close();

  activeSession = null;
  return videoPath;
}
