import { spawn } from 'child_process';

/** A one-line, actionable message instead of a raw ffmpeg stack trace. */
export function describeFfmpegError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ENOENT')) {
    return 'ffmpeg not found. Install it (e.g. `brew install ffmpeg`, or see https://ffmpeg.org/download.html) and try again.';
  }
  return msg.split('\n').filter(Boolean).slice(-3).join(' ');
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `ffmpeg exited with code ${code}`));
      }
    });
  });
}

/** Converts a recorded video (e.g. Playwright's webm) to mp4, the format X/LinkedIn expect. */
export async function convertToMp4(inputPath: string, outputPath: string): Promise<string> {
  await runFfmpeg(['-y', '-i', inputPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', outputPath]);
  return outputPath;
}

export interface GifOptions {
  /** Frames per second in the output GIF. Defaults to 10. */
  fps?: number;
  /** Output width in pixels; height scales to preserve aspect ratio. Defaults to 480. */
  width?: number;
}

/** Converts a recorded video to a short, shareable GIF. */
export async function convertToGif(
  inputPath: string,
  outputPath: string,
  options: GifOptions = {}
): Promise<string> {
  const fps = options.fps ?? 10;
  const width = options.width ?? 480;
  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-vf',
    `fps=${fps},scale=${width}:-1:flags=lanczos`,
    outputPath,
  ]);
  return outputPath;
}
