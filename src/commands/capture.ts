import { renameSync } from 'fs';
import { join, dirname } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { isInitialized, capturesDir, ensureDirectories } from '../config/settings.js';
import { captureScreenshot, VIEWPORT_PRESETS, type ViewportPreset } from '../capture/screenshot.js';
import { startRecording, stopRecording } from '../capture/recorder.js';
import { convertToMp4, convertToGif, describeFfmpegError } from '../capture/convert.js';
import {
  recordTerminalSession,
  convertCastToGif,
  describeAsciinemaError,
  describeAggError,
} from '../capture/terminal.js';

const RECORDING_FORMATS = ['webm', 'mp4', 'gif'] as const;
type RecordingFormat = (typeof RECORDING_FORMATS)[number];

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

export interface CaptureRecordCommandOptions {
  format?: string;
  gifWidth?: string;
  gifFps?: string;
}

export async function captureRecordCommand(
  url: string,
  options: CaptureRecordCommandOptions = {}
): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const format = (options.format ?? 'webm') as RecordingFormat;
  if (!RECORDING_FORMATS.includes(format)) {
    console.error(`Unknown format "${options.format}". Choose one of: ${RECORDING_FORMATS.join(', ')}`);
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
    const rawVideoPath = await stopRecording();
    if (!rawVideoPath) {
      stopSpinner.warn('Recording stopped but no video path returned.');
      return;
    }

    // Playwright names the file with an opaque hash. Give it a
    // predictable, timestamped name like every other capture.
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const webmPath = join(dirname(rawVideoPath), `recording-${timestamp}.webm`);
    renameSync(rawVideoPath, webmPath);
    stopSpinner.succeed(`Recording saved: ${chalk.green(webmPath)}`);

    if (format === 'webm') return;

    const convertSpinner = ora(`Converting to ${format}...`).start();
    try {
      const outPath =
        format === 'mp4'
          ? await convertToMp4(webmPath, webmPath.replace(/\.webm$/, '.mp4'))
          : await convertToGif(webmPath, webmPath.replace(/\.webm$/, '.gif'), {
              width: options.gifWidth ? Number(options.gifWidth) : undefined,
              fps: options.gifFps ? Number(options.gifFps) : undefined,
            });
      convertSpinner.succeed(`${format} saved: ${chalk.green(outPath)}`);
    } catch (err) {
      convertSpinner.fail(`Conversion to ${format} failed: ${describeFfmpegError(err)}`);
    }
  } catch (err) {
    spinner.fail('Recording failed');
    console.error(err);
    process.exit(1);
  }
}

const TERMINAL_FORMATS = ['cast', 'gif'] as const;
type TerminalFormat = (typeof TERMINAL_FORMATS)[number];

export interface CaptureTerminalCommandOptions {
  format?: string;
  theme?: string;
  cols?: string;
  rows?: string;
}

export async function captureTerminalCommand(
  options: CaptureTerminalCommandOptions = {}
): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const format = (options.format ?? 'cast') as TerminalFormat;
  if (!TERMINAL_FORMATS.includes(format)) {
    console.error(`Unknown format "${options.format}". Choose one of: ${TERMINAL_FORMATS.join(', ')}`);
    process.exit(1);
  }

  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const castPath = join(capturesDir(), `terminal-${timestamp}.cast`);

  console.log(chalk.dim('Recording started. Type your demo, then `exit` or Ctrl+D to stop.'));
  try {
    await recordTerminalSession(castPath, {
      cols: options.cols ? Number(options.cols) : undefined,
      rows: options.rows ? Number(options.rows) : undefined,
    });
    console.log(chalk.green(`Saved: ${castPath}`));
  } catch (err) {
    console.error(`Recording failed: ${describeAsciinemaError(err)}`);
    process.exit(1);
  }

  if (format !== 'gif') return;

  const gifPath = join(capturesDir(), `terminal-${timestamp}.gif`);
  const spinner = ora('Converting to GIF...').start();
  try {
    await convertCastToGif(castPath, gifPath, { theme: options.theme });
    spinner.succeed(`GIF saved: ${chalk.green(gifPath)}`);
  } catch (err) {
    // The .cast already saved successfully, so a GIF conversion failure
    // is reported, not fatal, same precedent as the mp4/gif branch above.
    spinner.fail(`GIF conversion failed: ${describeAggError(err)}`);
  }
}
