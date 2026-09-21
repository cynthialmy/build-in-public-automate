import { spawn } from 'child_process';

/** A one-line, actionable message instead of a raw asciinema stack trace. */
export function describeAsciinemaError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ENOENT')) {
    return 'asciinema not found. Install it (e.g. `brew install asciinema`, or see https://docs.asciinema.org/manual/cli/installation/) and try again.';
  }
  return msg.split('\n').filter(Boolean).slice(-3).join(' ');
}

/** A one-line, actionable message instead of a raw agg stack trace. */
export function describeAggError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ENOENT')) {
    return 'agg not found. Install it (e.g. `brew install agg`, or see https://github.com/asciinema/agg#installation) and try again.';
  }
  return msg.split('\n').filter(Boolean).slice(-3).join(' ');
}

export interface TerminalRecordOptions {
  cols?: number;
  rows?: number;
}

/**
 * Hands the real terminal to `asciinema rec` (inherited stdio) so the user
 * can type a live demo, until they exit the shell or press Ctrl+D. Unlike
 * `convert.ts`'s ffmpeg calls, this needs to actually touch the user's
 * terminal, not just run in the background.
 */
export function recordTerminalSession(
  castPath: string,
  options: TerminalRecordOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['rec', castPath];
    if (options.cols || options.rows) {
      args.push('--window-size', `${options.cols ?? 80}x${options.rows ?? 24}`);
    }
    const proc = spawn('asciinema', args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(castPath);
      else reject(new Error(`asciinema exited with code ${code}`));
    });
  });
}

export interface TerminalGifOptions {
  theme?: string;
}

/** Converts a recorded .cast to a shareable GIF via agg — no browser involved. */
export function convertCastToGif(
  castPath: string,
  gifPath: string,
  options: TerminalGifOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [castPath, gifPath];
    if (options.theme) args.push('--theme', options.theme);
    const proc = spawn('agg', args);
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(gifPath);
      else reject(new Error(stderr || `agg exited with code ${code}`));
    });
  });
}
