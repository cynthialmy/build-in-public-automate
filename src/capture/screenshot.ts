import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export type ViewportPreset =
  | 'og'
  | 'x'
  | 'linkedin'
  | 'reddit'
  | 'hn'
  | 'desktop'
  | 'mobile';

/** Viewport sizes tuned per platform's card/preview dimensions. */
export const VIEWPORT_PRESETS: Record<ViewportPreset, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  x: { width: 1200, height: 675 },
  linkedin: { width: 1200, height: 627 },
  reddit: { width: 1200, height: 800 },
  hn: { width: 1280, height: 800 },
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export interface CaptureOptions {
  /** Viewport preset controlling capture dimensions. Defaults to 'desktop'. */
  preset?: ViewportPreset;
  /** CSS selector to crop the screenshot to a single element instead of the page. */
  selector?: string;
  /** Device scale factor for retina-quality output. Defaults to 1. */
  scale?: number;
  /** Wait for a selector to appear before capturing (e.g. content that renders late). */
  waitFor?: string;
  /** Extra delay in ms after page load / waitFor, before capturing. */
  delay?: number;
  /** Capture the full scrollable page rather than just the viewport. Ignored when `selector` is set. Defaults to true unless a card preset is used. */
  fullPage?: boolean;
}

const CARD_PRESETS = new Set<ViewportPreset>(['og', 'x', 'linkedin', 'reddit', 'hn']);

/** A one-line, actionable message instead of a raw Playwright stack trace. */
export function describeScreenshotError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("Executable doesn't exist") || msg.toLowerCase().includes('playwright install')) {
    return 'Playwright browser not installed. Run `npx playwright install chromium` and try again.';
  }
  return msg.split('\n')[0]!;
}

export async function captureScreenshot(
  url: string,
  outputPath: string,
  options: CaptureOptions = {}
): Promise<string> {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const preset = options.preset ?? 'desktop';
  const viewport = VIEWPORT_PRESETS[preset];
  const fullPage = options.fullPage ?? (options.selector ? false : !CARD_PRESETS.has(preset));

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: options.scale ?? 1,
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    if (options.waitFor) {
      await page.waitForSelector(options.waitFor);
    }
    if (options.delay) {
      await page.waitForTimeout(options.delay);
    }

    if (options.selector) {
      await page.locator(options.selector).screenshot({ path: outputPath });
    } else {
      await page.screenshot({ path: outputPath, fullPage });
    }

    return outputPath;
  } finally {
    await browser.close();
  }
}
