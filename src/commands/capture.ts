import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { isInitialized, capturesDir, ensureDirectories } from '../config/settings.js';
import { captureScreenshot, VIEWPORT_PRESETS, type ViewportPreset } from '../capture/screenshot.js';
import { startRecording, stopRecording } from '../capture/recorder.js';

export interface CaptureScreenshotCommandOptions {
  preset?: string;
  selector?: string;
  scale?: string;
  waitFor?: string;
  delay?: string;
  fullPage?: boolean;
}

export async function captureScreenshotCommand(
  url: string,
  options: CaptureScreenshotCommandOptions = {}
): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (options.preset && !(options.preset in VIEWPORT_PRESETS)) {
    console.error(
      `Unknown preset "${options.preset}". Choose one of: ${Object.keys(VIEWPORT_PRESETS).join(', ')}`
    );
    process.exit(1);
  }

  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(capturesDir(), `screenshot-${timestamp}.png`);

  const spinner = ora(`Capturing screenshot of ${url}...`).start();
  try {
    const saved = await captureScreenshot(url, outPath, {
      preset: options.preset as ViewportPreset | undefined,
      selector: options.selector,
      scale: options.scale ? Number(options.scale) : undefined,
      waitFor: options.waitFor,
      delay: options.delay ? Number(options.delay) : undefined,
      fullPage: options.fullPage,
    });
    spinner.succeed(`Screenshot saved: ${chalk.green(saved)}`);
  } catch (err) {
    spinner.fail('Screenshot failed');
    console.error(err);
    process.exit(1);
  }
}

export async function captureRecordCommand(url: string): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  ensureDirectories();
  const videoDir = capturesDir();

  const spinner = ora(`Starting recording of ${url}...`).start();
  try {
    await startRecording(url, videoDir);
    spinner.succeed('Recording started. Press Enter to stop...');

    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
    });

    const stopSpinner = ora('Stopping recording...').start();
    const videoPath = await stopRecording();
    if (videoPath) {
      stopSpinner.succeed(`Recording saved: ${chalk.green(videoPath)}`);
    } else {
      stopSpinner.warn('Recording stopped but no video path returned.');
    }
  } catch (err) {
    spinner.fail('Recording failed');
    console.error(err);
    process.exit(1);
  }
}
