import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const executablePathMock = vi.fn();
vi.mock('playwright', () => ({
  chromium: { executablePath: executablePathMock },
}));

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawn: spawnMock }));

const existsSyncMock = vi.hoisted(() => vi.fn());
vi.mock('fs', () => ({ existsSync: existsSyncMock }));

function fakeProcess(exitCode: number | null, emitError?: Error) {
  const proc = new EventEmitter();
  queueMicrotask(() => {
    if (emitError) {
      proc.emit('error', emitError);
    } else {
      proc.emit('close', exitCode);
    }
  });
  return proc;
}

describe('ensureChromiumInstalled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('does nothing when chromium is already installed', async () => {
    executablePathMock.mockReturnValue('/real/chromium');
    existsSyncMock.mockReturnValue(true);
    const { ensureChromiumInstalled } = await import('../../src/capture/ensure-browser.js');

    await ensureChromiumInstalled();

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('runs the install command when executablePath() throws (chromium missing)', async () => {
    executablePathMock.mockImplementation(() => {
      throw new Error("Executable doesn't exist");
    });
    spawnMock.mockImplementation(() => fakeProcess(0));
    const { ensureChromiumInstalled } = await import('../../src/capture/ensure-browser.js');

    await ensureChromiumInstalled();

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['playwright', 'install', 'chromium'],
      expect.objectContaining({ stdio: 'ignore' })
    );
  });

  it('runs the install command when executablePath() returns a path that does not exist', async () => {
    // Regression test: chromium.executablePath() always returns a computed
    // path string, installed or not — it never throws or checks the file
    // exists on its own. Trusting a truthy return value here previously
    // meant the auto-install silently never ran.
    executablePathMock.mockReturnValue('/not/actually/installed/chromium');
    existsSyncMock.mockReturnValue(false);
    spawnMock.mockImplementation(() => fakeProcess(0));
    const { ensureChromiumInstalled } = await import('../../src/capture/ensure-browser.js');

    await ensureChromiumInstalled();

    expect(spawnMock).toHaveBeenCalledWith(
      'npx',
      ['playwright', 'install', 'chromium'],
      expect.objectContaining({ stdio: 'ignore' })
    );
  });

  it('only checks once per process, even across multiple calls', async () => {
    executablePathMock.mockReturnValue('/real/chromium');
    existsSyncMock.mockReturnValue(true);
    const { ensureChromiumInstalled } = await import('../../src/capture/ensure-browser.js');

    await ensureChromiumInstalled();
    executablePathMock.mockClear();
    await ensureChromiumInstalled();

    expect(executablePathMock).not.toHaveBeenCalled();
  });

  it('does not throw when the install itself fails', async () => {
    executablePathMock.mockImplementation(() => {
      throw new Error("Executable doesn't exist");
    });
    spawnMock.mockImplementation(() => fakeProcess(1));
    const { ensureChromiumInstalled } = await import('../../src/capture/ensure-browser.js');

    await expect(ensureChromiumInstalled()).resolves.not.toThrow();
  });
});
