import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform, release } from 'os';
import { randomUUID } from 'crypto';
import { PostHog } from 'posthog-node';
import { colors } from './branding.js';

// Public PostHog project key — write-only, safe to ship in the package (same
// pattern as PostHog's own browser snippet).
const POSTHOG_KEY = 'phc_tYMLh3YB9iBKJ3xw3GoYLhVAUFXcyV4zY7yEfwqSFaq6';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// One request per event, bounded by TIMEOUT_MS, so a slow/offline network
// never meaningfully delays the CLI.
const TIMEOUT_MS = 1500;

interface TelemetryState {
  distinctId: string;
  optOut?: boolean;
  noticeShown?: boolean;
}

function telemetryDir(): string {
  return process.env.BIP_TELEMETRY_DIR || join(homedir(), '.buildpublic');
}

function statePath(): string {
  return join(telemetryDir(), 'telemetry.json');
}

function readState(): TelemetryState {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf-8')) as TelemetryState;
  } catch {
    return { distinctId: randomUUID() };
  }
}

function writeState(state: TelemetryState): void {
  try {
    mkdirSync(telemetryDir(), { recursive: true });
    writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // best-effort — telemetry must never break the CLI
  }
}

function envDisabled(): boolean {
  return process.env.BIP_TELEMETRY === '0' || !!process.env.VITEST;
}

export function isTelemetryEnabled(): boolean {
  if (envDisabled()) return false;
  return !readState().optOut;
}

export function setTelemetryOptOut(optOut: boolean): void {
  const state = readState();
  writeState({ ...state, optOut });
}

export function telemetryStatus(): { enabled: boolean; distinctId: string } {
  const state = readState();
  return { enabled: isTelemetryEnabled(), distinctId: state.distinctId };
}

/** Prints a one-time disclosure notice the first time telemetry would fire. */
function ensureNotice(): void {
  const state = readState();
  if (state.noticeShown) return;
  writeState({ ...state, noticeShown: true });
  console.log(
    colors.dim(
      'bip collects anonymous usage data (which commands run) to guide development. ' +
        'No git content, drafts, or credentials are ever sent. Disable with `bip telemetry off`.'
    )
  );
}

/**
 * Fire-and-forget: does not block the caller. Node's event loop stays alive
 * until the underlying HTTP request settles or TIMEOUT_MS elapses, whichever
 * comes first, so a hung network never hangs the CLI exit.
 */
export function trackCommand(
  command: string,
  bipVersion: string,
  properties: Record<string, string> = {}
): void {
  if (!isTelemetryEnabled()) return;
  ensureNotice();

  const state = readState();
  const client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 });

  client.capture({
    distinctId: state.distinctId,
    event: 'command_run',
    properties: {
      command,
      ...properties,
      bip_version: bipVersion,
      os: platform(),
      os_release: release(),
      node_version: process.version,
    },
  });

  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  Promise.race([client.shutdown(), timeout]).catch(() => {});
}
