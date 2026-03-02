import { program } from 'commander';
import { createRequire } from 'module';
import { initCommand } from './commands/init.js';
import { authCommand } from './commands/auth.js';
import { draftCommand } from './commands/draft.js';
import { postCommand } from './commands/post.js';
import { doctorCommand } from './commands/doctor.js';
import { statusCommand } from './commands/status.js';
import { historyCommand } from './commands/history.js';
import {
  captureScreenshotCommand,
  captureRecordCommand,
} from './commands/capture.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

program
  .name('bip')
  .description('Build in public — share your progress to X, LinkedIn, Reddit, and HackerNews')
  .version(pkg.version);

// bip init
program
  .command('init')
  .description('Initialize bip in the current project')
  .option('--force', 'Reinitialize even if already set up')
  .action((options: { force?: boolean }) => initCommand(options));

// bip auth [platform]
program
  .command('auth [platform]')
  .description('Set up credentials for a platform (x, linkedin, reddit, hackernews)')
  .option('--list', 'Show all platform credential statuses')
  .action((platform?: string, options: { list?: boolean } = {}) =>
    authCommand(platform, options)
  );

// bip draft
program
  .command('draft')
  .description('Generate AI-powered post drafts from your recent git activity')
  .option(
    '--platforms <platforms>',
    'Comma-separated list of platforms (e.g. x,linkedin)'
  )
  .action((options: { platforms?: string }) => draftCommand(options));

// bip post [platform]
program
  .command('post [platform]')
  .description('Publish drafts to social platforms')
  .option('--dry-run', 'Preview posts without publishing')
  .action((platform?: string, options: { dryRun?: boolean } = {}) =>
    postCommand(platform, options)
  );

// bip doctor
program
  .command('doctor')
  .description('Check your bip setup for common issues')
  .action(() => doctorCommand());

// bip status
program
  .command('status')
  .description('Show an overview of the current project bip state')
  .action(() => statusCommand());

// bip history
program
  .command('history')
  .description('Show past drafts with content previews')
  .option('--limit <n>', 'Number of drafts to show', '10')
  .action((options: { limit?: string }) => historyCommand(options));

// bip capture
const capture = program
  .command('capture')
  .description('Capture screenshots or screen recordings');

capture
  .command('screenshot <url>')
  .description('Take a full-page screenshot of a URL')
  .action((url: string) => captureScreenshotCommand(url));

capture
  .command('record <url>')
  .description('Record a browser session (press Enter to stop)')
  .action((url: string) => captureRecordCommand(url));

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
});
