import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const TELEMETRY_TEST_DIR = join(process.cwd(), '.buildpublic-telemetry-test');

const captureMock = vi.fn();
const shutdownMock = vi.fn().mockResolvedValue(undefined);

vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: captureMock,
    shutdown: shutdownMock,
  })),
}));

process.env.BIP_TELEMETRY_DIR = TELEMETRY_TEST_DIR;

const { isTelemetryEnabled, setTelemetryOptOut, telemetryStatus, trackCommand } = await import(
  '../../src/core/telemetry.js'
);

describe('telemetry', () => {
  const originalVitestFlag = process.env.VITEST;

  beforeEach(() => {
    vi.clearAllMocks();
    if (existsSync(TELEMETRY_TEST_DIR)) {
      rmSync(TELEMETRY_TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    process.env.VITEST = originalVitestFlag;
  });

  afterAll(() => {
    if (existsSync(TELEMETRY_TEST_DIR)) {
      rmSync(TELEMETRY_TEST_DIR, { recursive: true, force: true });
    }
  });

  it('is disabled by default while VITEST is set', () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('reports enabled once the VITEST guard is lifted and no opt-out is set', () => {
    delete process.env.VITEST;
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('persists opt-out across calls', () => {
    delete process.env.VITEST;
    setTelemetryOptOut(true);
    expect(isTelemetryEnabled()).toBe(false);
    expect(telemetryStatus().enabled).toBe(false);

    setTelemetryOptOut(false);
    expect(isTelemetryEnabled()).toBe(true);
  });

  it('never throws and does not call PostHog while disabled', () => {
    expect(() => trackCommand('draft', '0.6.0')).not.toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('captures an event with safe, non-identifying properties when enabled', async () => {
    delete process.env.VITEST;
    trackCommand('draft', '0.6.0', { preview: 'true' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(captureMock).toHaveBeenCalledTimes(1);
    const [call] = captureMock.mock.calls[0];
    expect(call.event).toBe('command_run');
    expect(call.properties.command).toBe('draft');
    expect(call.properties.bip_version).toBe('0.6.0');
    expect(call.properties.preview).toBe('true');
    expect(call.distinctId).toEqual(expect.any(String));
  });
});
