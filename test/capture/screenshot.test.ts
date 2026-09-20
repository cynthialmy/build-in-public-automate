import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import {
  captureScreenshot,
  describeScreenshotError,
  VIEWPORT_PRESETS,
} from '../../src/capture/screenshot.js';

const screenshotMock = vi.fn().mockResolvedValue(undefined);
const waitForSelectorMock = vi.fn().mockResolvedValue(undefined);
const waitForTimeoutMock = vi.fn().mockResolvedValue(undefined);
const gotoMock = vi.fn().mockResolvedValue(undefined);
const locatorScreenshotMock = vi.fn().mockResolvedValue(undefined);
const closeMock = vi.fn().mockResolvedValue(undefined);

const page = {
  goto: gotoMock,
  screenshot: screenshotMock,
  waitForSelector: waitForSelectorMock,
  waitForTimeout: waitForTimeoutMock,
  locator: vi.fn(() => ({ screenshot: locatorScreenshotMock })),
};

const newPageMock = vi.fn().mockResolvedValue(page);
const launchMock = vi.fn().mockResolvedValue({ newPage: newPageMock, close: closeMock });

vi.mock('playwright', () => ({
  chromium: { launch: launchMock },
}));

const OUT_DIR = join(process.cwd(), '.buildpublic-test', 'captures');
const OUT_PATH = join(OUT_DIR, 'shot.png');

describe('captureScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    newPageMock.mockResolvedValue(page);
    launchMock.mockResolvedValue({ newPage: newPageMock, close: closeMock });
    if (existsSync(OUT_DIR)) {
      rmSync(OUT_DIR, { recursive: true, force: true });
    }
  });

  it('creates the output directory if missing', async () => {
    await captureScreenshot('https://example.com', OUT_PATH);
    expect(existsSync(OUT_DIR)).toBe(true);
  });

  it('defaults to the desktop preset and full-page capture', async () => {
    await captureScreenshot('https://example.com', OUT_PATH);
    expect(newPageMock).toHaveBeenCalledWith({
      viewport: VIEWPORT_PRESETS.desktop,
      deviceScaleFactor: 1,
    });
    expect(screenshotMock).toHaveBeenCalledWith({ path: OUT_PATH, fullPage: true });
  });

  it('uses viewport-only capture for card presets by default', async () => {
    await captureScreenshot('https://example.com', OUT_PATH, { preset: 'og' });
    expect(newPageMock).toHaveBeenCalledWith({
      viewport: VIEWPORT_PRESETS.og,
      deviceScaleFactor: 1,
    });
    expect(screenshotMock).toHaveBeenCalledWith({ path: OUT_PATH, fullPage: false });
  });

  it('lets fullPage be overridden explicitly', async () => {
    await captureScreenshot('https://example.com', OUT_PATH, { preset: 'og', fullPage: true });
    expect(screenshotMock).toHaveBeenCalledWith({ path: OUT_PATH, fullPage: true });
  });

  it('applies device scale factor', async () => {
    await captureScreenshot('https://example.com', OUT_PATH, { scale: 2 });
    expect(newPageMock).toHaveBeenCalledWith({
      viewport: VIEWPORT_PRESETS.desktop,
      deviceScaleFactor: 2,
    });
  });

  it('crops to a selector via element screenshot instead of the page', async () => {
    await captureScreenshot('https://example.com', OUT_PATH, { selector: '.card' });
    expect(page.locator).toHaveBeenCalledWith('.card');
    expect(locatorScreenshotMock).toHaveBeenCalledWith({ path: OUT_PATH });
    expect(screenshotMock).not.toHaveBeenCalled();
  });

  it('waits for a selector and an extra delay before capturing', async () => {
    await captureScreenshot('https://example.com', OUT_PATH, { waitFor: '.ready', delay: 500 });
    expect(waitForSelectorMock).toHaveBeenCalledWith('.ready');
    expect(waitForTimeoutMock).toHaveBeenCalledWith(500);
  });

  it('closes the browser even if the capture throws', async () => {
    screenshotMock.mockRejectedValueOnce(new Error('boom'));
    await expect(captureScreenshot('https://example.com', OUT_PATH)).rejects.toThrow('boom');
    expect(closeMock).toHaveBeenCalled();
  });
});

describe('describeScreenshotError', () => {
  it('gives an actionable message when the Playwright browser is missing', () => {
    const err = new Error("Executable doesn't exist at /path/to/chromium");
    expect(describeScreenshotError(err)).toBe(
      'Playwright browser not installed. Run `npx playwright install chromium` and try again.'
    );
  });

  it('passes through the first line of other errors', () => {
    const err = new Error('net::ERR_NAME_NOT_RESOLVED\nmore stack trace lines');
    expect(describeScreenshotError(err)).toBe('net::ERR_NAME_NOT_RESOLVED');
  });

  it('stringifies non-Error values', () => {
    expect(describeScreenshotError('plain string error')).toBe('plain string error');
  });
});
