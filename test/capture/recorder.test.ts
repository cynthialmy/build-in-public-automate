import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { startRecording, stopRecording } from '../../src/capture/recorder.js';

const pageMock = {
  goto: vi.fn().mockResolvedValue(undefined),
  video: vi.fn(() => ({ path: vi.fn().mockResolvedValue('/tmp/rec-abc123.webm') })),
  close: vi.fn().mockResolvedValue(undefined),
};
const contextMock = {
  newPage: vi.fn().mockResolvedValue(pageMock),
  close: vi.fn().mockResolvedValue(undefined),
};
const browserMock = {
  newContext: vi.fn().mockResolvedValue(contextMock),
  close: vi.fn().mockResolvedValue(undefined),
};
const launchMock = vi.fn().mockResolvedValue(browserMock);

vi.mock('playwright', () => ({
  chromium: { launch: launchMock, executablePath: vi.fn().mockReturnValue(process.execPath) },
}));

const VIDEO_DIR = join(process.cwd(), '.buildpublic-test', 'captures');

describe('recorder', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    launchMock.mockResolvedValue(browserMock);
    browserMock.newContext.mockResolvedValue(contextMock);
    contextMock.newPage.mockResolvedValue(pageMock);
    pageMock.video.mockReturnValue({ path: vi.fn().mockResolvedValue('/tmp/rec-abc123.webm') });
    if (existsSync(VIDEO_DIR)) rmSync(VIDEO_DIR, { recursive: true, force: true });
    // stopRecording throws if a session is already active from a prior test.
    try {
      await stopRecording();
    } catch {
      /* no active session, expected in the common case */
    }
  });

  it('creates the video directory and launches a headful browser at the URL', async () => {
    await startRecording('https://example.com', VIDEO_DIR);

    expect(existsSync(VIDEO_DIR)).toBe(true);
    expect(launchMock).toHaveBeenCalledWith({ headless: false });
    expect(browserMock.newContext).toHaveBeenCalledWith({ recordVideo: { dir: VIDEO_DIR } });
    expect(pageMock.goto).toHaveBeenCalledWith('https://example.com');

    await stopRecording();
  });

  it('rejects starting a second session while one is already active', async () => {
    await startRecording('https://example.com', VIDEO_DIR);
    await expect(startRecording('https://example.com', VIDEO_DIR)).rejects.toThrow(/already active/);
    await stopRecording();
  });

  it('stopRecording closes the page/context/browser and returns the video path', async () => {
    await startRecording('https://example.com', VIDEO_DIR);
    const path = await stopRecording();

    expect(path).toBe('/tmp/rec-abc123.webm');
    expect(pageMock.close).toHaveBeenCalled();
    expect(contextMock.close).toHaveBeenCalled();
    expect(browserMock.close).toHaveBeenCalled();
  });

  it('rejects stopping when there is no active session', async () => {
    await expect(stopRecording()).rejects.toThrow(/No active recording session/);
  });

  it('allows starting a new session after stopping the previous one', async () => {
    await startRecording('https://example.com', VIDEO_DIR);
    await stopRecording();
    await expect(startRecording('https://example.com', VIDEO_DIR)).resolves.toBeUndefined();
    await stopRecording();
  });
});
