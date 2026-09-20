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
import { metricsCommand } from './commands/metrics.js';
import { soulCommand, soulEvolveCommand } from './commands/soul.js';
import { evolveCommand } from './commands/evolve.js';
import {
  captureScreenshotCommand,
  captureRecordCommand,
} from './commands/capture.js';
import { mcpCommand } from './commands/mcp.js';

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
  .option(
    '--preview',
    'Generate one post without running `bip init` first. Needs only an LLM API key, saves nothing'
  )
  .option(
    '--focus <text>',
    'What this post should emphasize (used with --context-only or the interactive flow)'
  )
  .option(
    '--context-only',
    'Print the draft context as JSON and exit. No LLM key needed: draft with your own coding agent, then `bip draft --apply <file>`'
  )
  .option(
    '--apply <file>',
    'Save posts drafted elsewhere (a JSON file of { posts, attachments }) as a real draft. No LLM key needed'
  )
  .action(
    (options: {
      platforms?: string;
      provider?: string;
      preview?: boolean;
      focus?: string;
      contextOnly?: boolean;
      apply?: string;
    }) => draftCommand(options)
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

// bip metrics
program
  .command('metrics')
  .description('Show engagement (likes/comments) for previously posted drafts')
  .option('--limit <n>', 'Number of posted drafts to check', '10')
  .action((options: { limit?: string }) => metricsCommand(options));

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
  .option(
    '--context-only',
    'Print the evolve context as JSON and exit. No LLM key needed: evolve with your own coding agent, then `bip soul evolve --apply <file>`'
  )
  .option(
    '--apply <file>',
    'Save a soul.md evolved elsewhere (a text file with the full content). No LLM key needed'
  )
  .action(
    (options: { provider?: string; contextOnly?: boolean; apply?: string }) =>
      soulEvolveCommand(options)
  );

// bip evolve
program
  .command('evolve')
  .description('Update BUILD_IN_PUBLIC.md based on recent project activity')
  .option(
    '--provider <id>',
    'AI provider when multiple API keys exist (e.g. glm, anthropic)'
  )
  .option(
    '--context-only',
    'Print the evolve context as JSON and exit. No LLM key needed: evolve with your own coding agent, then `bip evolve --apply <file>`'
  )
  .option(
    '--apply <file>',
    'Save a BUILD_IN_PUBLIC.md evolved elsewhere (a text file with the full content). No LLM key needed'
  )
  .action(
    (options: { provider?: string; contextOnly?: boolean; apply?: string }) =>
      evolveCommand(options)
  );

// bip capture
const capture = program
  .command('capture')
  .description('Capture screenshots or screen recordings');

capture
  .command('screenshot <url>')
  .description('Capture a screenshot of a URL')
  .option(
    '--preset <name>',
    'Viewport preset: og, x, linkedin, reddit, hn, desktop, mobile (default: desktop)'
  )
  .option('--selector <css>', 'Crop to a single element instead of the page/viewport')
  .option('--scale <n>', 'Device scale factor for retina output (e.g. 2)')
  .option('--wait-for <css>', 'Wait for a selector to appear before capturing')
  .option('--delay <ms>', 'Extra delay in ms before capturing')
  .option('--full-page', 'Capture the full scrollable page instead of just the viewport')
  .action(
    (
      url: string,
      options: {
        preset?: string;
        selector?: string;
        scale?: string;
        waitFor?: string;
        delay?: string;
        fullPage?: boolean;
      }
    ) => captureScreenshotCommand(url, options)
  );

capture
  .command('record <url>')
  .description('Record a browser session (press Enter to stop)')
  .option(
    '--format <format>',
    'Output format: webm, mp4, or gif (default: webm). mp4/gif need ffmpeg installed'
  )
  .option('--gif-width <px>', 'GIF width in pixels, height scales to match (default: 480)')
  .option('--gif-fps <n>', 'GIF frame rate (default: 10)')
  .action(
    (url: string, options: { format?: string; gifWidth?: string; gifFps?: string }) =>
      captureRecordCommand(url, options)
  );

// bip mcp
program
  .command('mcp')
  .description('Start bip as an MCP server (stdio) for Claude Code / Claude Desktop')
  .action(() => mcpCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
});
