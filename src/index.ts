import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { program } from 'commander';

loadEnv({ path: resolve(process.cwd(), '.env') });
import { createRequire } from 'module';
import { initCommand } from './commands/init.js';
import { authCommand } from './commands/auth.js';
import { draftCommand } from './commands/draft.js';
import { postCommand } from './commands/post.js';
import { doctorCommand } from './commands/doctor.js';
import { statusCommand } from './commands/status.js';
import { historyCommand } from './commands/history.js';
import { soulCommand, soulEvolveCommand } from './commands/soul.js';
import { evolveCommand } from './commands/evolve.js';
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
  .description(
    'Set up credentials: social platforms (x, linkedin, …) or AI keys (`auth ai`)'
  )
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
  .option(
    '--provider <id>',
    'AI provider when multiple API keys exist (e.g. glm, anthropic, openai)'
  )
  .action((options: { platforms?: string; provider?: string }) =>
    draftCommand(options)
  );

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

// bip soul
const soul = program
  .command('soul')
  .description('Define your posting voice and personality');

soul
  .command('init', { isDefault: true })
  .description('Interactive questionnaire to create or re-do soul.md')
  .action(() => soulCommand());

soul
  .command('evolve')
  .description('Analyze your posting patterns and suggest soul.md refinements')
  .option(
    '--provider <id>',
    'AI provider when multiple API keys exist (e.g. glm, anthropic)'
  )
  .action((options: { provider?: string }) => soulEvolveCommand(options));

// bip evolve
program
  .command('evolve')
  .description('Update BUILD_IN_PUBLIC.md based on recent project activity')
  .option(
    '--provider <id>',
    'AI provider when multiple API keys exist (e.g. glm, anthropic)'
  )
  .action((options: { provider?: string }) => evolveCommand(options));

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
