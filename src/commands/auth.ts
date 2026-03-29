import { input, password, select } from '@inquirer/prompts';
import { setCredentials, hasCredentials } from '../config/credentials.js';
import { isInitialized } from '../config/settings.js';
import { colors } from '../core/branding.js';
import type { Platform } from '../config/types.js';
import { authAiCommand } from './auth-ai.js';

type AuthTarget = Platform | 'ai';

/** `bip auth ai glm` → `glm` */
function getProviderAfterAuthAi(): string | undefined {
  const argv = process.argv;
  const authIdx = argv.indexOf('auth');
  if (authIdx === -1) return undefined;
  if (argv[authIdx + 1] !== 'ai') return undefined;
  const next = argv[authIdx + 2];
  if (!next || next.startsWith('-')) return undefined;
  return next;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

const ALL_PLATFORMS: Platform[] = ['x', 'linkedin', 'reddit', 'hackernews'];

async function verifyX(creds: { appKey: string; appSecret: string; accessToken: string; accessSecret: string }): Promise<boolean> {
  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi(creds);
    await client.v2.me();
    return true;
  } catch {
    return false;
  }
}

async function verifyLinkedIn(creds: { accessToken: string }): Promise<boolean> {
  try {
    const res = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function verifyReddit(creds: { clientId: string; clientSecret: string; username: string; password: string }): Promise<boolean> {
  try {
    const Snoowrap = (await import('snoowrap')).default;
    const r = new Snoowrap({
      userAgent: 'bip-cli/1.0',
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      username: creds.username,
      password: creds.password,
    });
    await (r.getMe() as unknown as Promise<void>);
    return true;
  } catch {
    return false;
  }
}

async function authX(): Promise<void> {
  console.log('\nX (Twitter) API credentials');
  console.log('Get yours at: https://developer.x.com/en/portal/dashboard\n');

  const appKey = await input({ message: 'App Key (Consumer Key):' });
  const appSecret = await password({ message: 'App Secret (Consumer Secret):' });
  const accessToken = await input({ message: 'Access Token:' });
  const accessSecret = await password({ message: 'Access Token Secret:' });

  console.log(colors.dim('\nOptional: X login credentials for browser fallback (used if API returns 402/403)'));
  const username = await input({ message: 'X username (or press Enter to skip):', default: '' });
  const pw = username ? await password({ message: 'X password:' }) : '';

  const creds = {
    appKey, appSecret, accessToken, accessSecret,
    ...(username ? { username, password: pw } : {}),
  };
  setCredentials('x', creds);
  console.log('\nX credentials saved. Verifying...');

  const ok = await verifyX({ appKey, appSecret, accessToken, accessSecret });
  if (ok) {
    console.log(colors.success('✓ Credentials verified'));
  } else {
    console.log(colors.error('✗ Verification failed — credentials saved but could not connect'));
  }
}

async function authLinkedIn(): Promise<void> {
  console.log('\nLinkedIn credentials');
  console.log('Get an access token via OAuth at: https://www.linkedin.com/developers/\n');

  const accessToken = await input({ message: 'Access Token:' });
  const personUrn = await input({
    message: 'Person URN (e.g. urn:li:person:XXXXXX):',
  });

  const creds = { accessToken, personUrn };
  setCredentials('linkedin', creds);
  console.log('\nLinkedIn credentials saved. Verifying...');

  const ok = await verifyLinkedIn(creds);
  if (ok) {
    console.log(colors.success('✓ Credentials verified'));
  } else {
    console.log(colors.error('✗ Verification failed — credentials saved but could not connect'));
  }
}

async function authReddit(): Promise<void> {
  console.log('\nReddit credentials');
  console.log(
    'Create a "script" app at: https://www.reddit.com/prefs/apps\n'
  );

  const clientId = await input({ message: 'Client ID:' });
  const clientSecret = await password({ message: 'Client Secret:' });
  const username = await input({ message: 'Reddit username:' });
  const pw = await password({ message: 'Reddit password:' });

  const creds = { clientId, clientSecret, username, password: pw };
  setCredentials('reddit', creds);
  console.log('\nReddit credentials saved. Verifying...');

  const ok = await verifyReddit(creds);
  if (ok) {
    console.log(colors.success('✓ Credentials verified'));
  } else {
    console.log(colors.error('✗ Verification failed — credentials saved but could not connect'));
  }
}

async function authHackerNews(): Promise<void> {
  console.log('\nHackerNews credentials (used for browser automation)');
  console.log('These are your regular HN login credentials.\n');

  const username = await input({ message: 'HackerNews username:' });
  const pw = await password({ message: 'HackerNews password:' });

  setCredentials('hackernews', { username, password: pw });
  console.log('\nHackerNews credentials saved.');
  console.log(colors.dim('  (HackerNews verification skipped — uses browser automation)'));
}

function listCommand(): void {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  console.log('\nPlatform credential status:\n');
  for (const p of ALL_PLATFORMS) {
    let configured = false;
    try { configured = hasCredentials(p); } catch { /* not set */ }
    const mark = configured ? colors.success('✓ configured') : colors.error('✗ not set');
    console.log(`  ${PLATFORM_LABELS[p].padEnd(16)} ${mark}`);
  }
  console.log();
}

export async function authCommand(platform?: string, options: { list?: boolean } = {}): Promise<void> {
  if (platform === 'ai') {
    await authAiCommand({
      list: options.list,
      provider: getProviderAfterAuthAi(),
    });
    return;
  }

  if (options.list) {
    listCommand();
    return;
  }

  let target = platform as AuthTarget | undefined;

  if (!target) {
    target = await select<AuthTarget>({
      message: 'What do you want to configure?',
      choices: [
        { name: 'AI / LLM API keys (Claude, OpenAI, GLM, …)', value: 'ai' },
        { name: PLATFORM_LABELS.x, value: 'x' },
        { name: PLATFORM_LABELS.linkedin, value: 'linkedin' },
        { name: PLATFORM_LABELS.reddit, value: 'reddit' },
        { name: PLATFORM_LABELS.hackernews, value: 'hackernews' },
      ],
    });
  }

  if (target === 'ai') {
    await authAiCommand({});
    return;
  }

  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  switch (target) {
    case 'x':
      await authX();
      break;
    case 'linkedin':
      await authLinkedIn();
      break;
    case 'reddit':
      await authReddit();
      break;
    case 'hackernews':
      await authHackerNews();
      break;
    default:
      console.error(
        `Unknown target: ${target}. Use: ai, x, linkedin, reddit, hackernews`
      );
      process.exit(1);
  }
}
