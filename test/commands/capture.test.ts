import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureDirectories as realEnsureDirectories, writeConfig } from '../../src/config/settings.js';
import { captureScreenshot } from '../../src/capture/screenshot.js';
import { startRecording, stopRecording } from '../../src/capture/recorder.js';
import { convertToMp4, convertToGif } from '../../src/capture/convert.js';
import { captureScreenshotCommand, captureRecordCommand } from '../../src/commands/capture.js';

vi.mock('../../src/capture/screenshot.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/capture/screenshot.js')>(
    '../../src/capture/screenshot.js'
  );
  return { ...actual, captureScreenshot: vi.fn().mockResolvedValue('/out/screenshot.png') };
});

vi.mock('../../src/capture/recorder.js', () => ({
  startRecording: vi.fn().mockResolvedValue(undefined),
  stopRecording: vi.fn().mockResolvedValue('/out/rec-raw.webm'),
}));

vi.mock('../../src/capture/convert.js', () => ({
  convertToMp4: vi.fn().mockResolvedValue('/out/recording.mp4'),
  convertToGif: vi.fn().mockResolvedValue('/out/recording.gif'),
  describeFfmpegError: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, renameSync: vi.fn() };
});

function exitError(code?: number) {
  return new Error(`process.exit(${code})`);
}

describe('captureScreenshotCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realEnsureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
  });

  it('exits when bip is not initialized', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });
    // Simulate "not initialized" by pointing capturesDir/config at a location
    // that was never written: use a fresh, uninitialized test dir via env override.
    const { rmSync } = await import('fs');
    rmSync('.buildpublic-test', { recursive: true, force: true });

    await expect(captureScreenshotCommand('https://example.com')).rejects.toThrow('process.exit(1)');
  });

  it('exits on an unknown preset without calling captureScreenshot', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(
      captureScreenshotCommand('https://example.com', { preset: 'bogus' })
    ).rejects.toThrow('process.exit(1)');
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('captures with the given options and reports the saved path', async () => {
    await captureScreenshotCommand('https://example.com', { preset: 'og', scale: '2' });

    expect(captureScreenshot).toHaveBeenCalledWith(
      'https://example.com',
      expect.stringContaining('screenshot-'),
      expect.objectContaining({ preset: 'og', scale: 2 })
    );
  });
});

describe('captureRecordCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realEnsureDirectories();
    writeConfig({
      projectName: 'test-project',
      platforms: {},
      postsDir: '.buildpublic-test/posts',
      capturesDir: '.buildpublic-test/captures',
    });
    vi.mocked(stopRecording).mockResolvedValue('/out/rec-raw.webm');
  });

  /** Simulates the user pressing Enter to stop the recording. */
  function pressEnterSoon() {
    setTimeout(() => process.stdin.emit('data', Buffer.from('\n')), 5);
  }

  it('exits on an unknown format without starting a recording', async () => {
    vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw exitError(code);
    });

    await expect(captureRecordCommand('https://example.com', { format: 'mov' })).rejects.toThrow(
      'process.exit(1)'
    );
    expect(startRecording).not.toHaveBeenCalled();
  });

  it('records to webm by default and does not attempt conversion', async () => {
    pressEnterSoon();
    await captureRecordCommand('https://example.com');

    expect(startRecording).toHaveBeenCalledWith('https://example.com', expect.any(String));
    expect(convertToMp4).not.toHaveBeenCalled();
    expect(convertToGif).not.toHaveBeenCalled();
  });

  it('converts to mp4 when requested', async () => {
    pressEnterSoon();
    await captureRecordCommand('https://example.com', { format: 'mp4' });

    expect(convertToMp4).toHaveBeenCalledWith(
      expect.stringContaining('recording-'),
      expect.stringContaining('.mp4')
    );
  });

  it('converts to gif with custom width/fps when requested', async () => {
    pressEnterSoon();
    await captureRecordCommand('https://example.com', { format: 'gif', gifWidth: '720', gifFps: '24' });

    expect(convertToGif).toHaveBeenCalledWith(
      expect.stringContaining('recording-'),
      expect.stringContaining('.gif'),
      { width: 720, fps: 24 }
    );
  });

  it('warns instead of converting when stopRecording returns no path', async () => {
    vi.mocked(stopRecording).mockResolvedValue(undefined);
    pressEnterSoon();

    await captureRecordCommand('https://example.com', { format: 'mp4' });

    expect(convertToMp4).not.toHaveBeenCalled();
  });
});
