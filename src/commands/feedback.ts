import { exec } from 'child_process';
import { platform, release } from 'os';
import { select, input } from '@inquirer/prompts';
import { colors } from '../core/branding.js';

const BUGS_URL = 'https://github.com/cynthialmy/build-in-public-automate/issues';
const RATING_ENDPOINT = 'https://formspree.io/f/xkjgrwdq';

const RATING_CHOICES = [
  { name: '5 — Love it', value: '5' },
  { name: '4 — Pretty good', value: '4' },
  { name: '3 — It’s fine', value: '3' },
  { name: '2 — Frustrating', value: '2' },
  { name: '1 — Not working for me', value: '1' },
  { name: 'Skip', value: '' },
];

export interface FeedbackOptions {
  rating?: string;
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`, () => {
    // Best-effort: if it fails, the URL is already printed for the user to open manually.
  });
}

function buildDiagnostics(bipVersion: string): string {
  return [
    `bip: ${bipVersion}`,
    `node: ${process.version}`,
    `os: ${platform()} ${release()}`,
  ].join('\n');
}

async function submitRatingOnly(rating: string, bipVersion: string): Promise<boolean> {
  try {
    const res = await fetch(RATING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ rating, diagnostics: buildDiagnostics(bipVersion) }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildIssueUrl(rating: string, message: string, bipVersion: string): string {
  const title = message
    ? message.slice(0, 60) + (message.length > 60 ? '…' : '')
    : `Feedback: ${rating}/5`;

  const bodyLines = ['## Feedback', ''];
  if (rating) bodyLines.push(`**Rating:** ${rating}/5`, '');
  bodyLines.push(
    message || '_No additional comments._',
    '',
    '---',
    '',
    buildDiagnostics(bipVersion)
  );

  const params = new URLSearchParams({
    title,
    body: bodyLines.join('\n'),
    labels: 'feedback',
  });

  return `${BUGS_URL}/new?${params.toString()}`;
}

export async function feedbackCommand(
  message: string | undefined,
  options: FeedbackOptions,
  bipVersion = 'unknown'
): Promise<void> {
  let rating = options.rating ?? '';
  let text = message ?? '';

  if (!options.rating && !message) {
    rating = await select({
      message: 'How’s bip working for you?',
      choices: RATING_CHOICES,
    });
    text = await input({
      message: 'Anything else to add? (enter to skip)',
    });
  }

  if (!rating && !text) {
    console.log(
      colors.dim(
        'Nothing to send — try `bip feedback "your message"` or `bip feedback --rating 4`.'
      )
    );
    return;
  }

  if (rating && !text) {
    const ok = await submitRatingOnly(rating, bipVersion);
    console.log();
    console.log(
      ok
        ? colors.success('Thanks for the rating!')
        : colors.warn('Couldn’t send the rating right now — try again later, or `bip feedback "message"` instead.')
    );
    console.log();
    return;
  }

  const url = buildIssueUrl(rating, text, bipVersion);

  console.log();
  console.log(colors.success('Thanks!') + ' Opening a pre-filled GitHub issue for you to review and submit.');
  console.log(colors.dim(url));
  console.log();

  openInBrowser(url);
}
