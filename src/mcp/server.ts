import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VIEWPORT_PRESETS, type ViewportPreset } from '../capture/screenshot.js';
import {
  getStatusData,
  getHistoryData,
  runCaptureScreenshot,
  runDraftPreview,
  getDraftContext,
  runSaveDraft,
  getEvolveDocContext,
  applyEvolvedDoc,
  getSoulEvolveContext,
  applyEvolvedSoul,
} from './tools.js';

const PRESET_NAMES = Object.keys(VIEWPORT_PRESETS) as [string, ...string[]];
const PLATFORM_NAMES = ['x', 'linkedin', 'reddit', 'hackernews'] as const;

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'build-in-public', version: '0.4.1' });

  server.registerTool(
    'bip_status',
    {
      description:
        'Get bip project status: project name, which social platforms have credentials, recent drafts, and any posting-cadence nudge.',
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(getStatusData());
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_history',
    {
      description: 'Browse past bip drafts with content previews.',
      inputSchema: {
        limit: z.number().int().positive().optional().describe('Max drafts to return (default 10)'),
      },
    },
    async ({ limit }) => {
      try {
        return textResult(getHistoryData(limit));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_capture_screenshot',
    {
      description:
        'Capture a screenshot of a URL, sized for a specific platform. Saves into .buildpublic/captures and returns the file path.',
      inputSchema: {
        url: z.string().url(),
        preset: z
          .enum(PRESET_NAMES)
          .optional()
          .describe('Viewport preset: og, x, linkedin, reddit, hn, desktop, mobile (default desktop)'),
        selector: z.string().optional().describe('CSS selector to crop to a single element'),
        scale: z.number().positive().optional().describe('Device scale factor for retina output'),
        waitFor: z.string().optional().describe('CSS selector to wait for before capturing'),
        delay: z.number().nonnegative().optional().describe('Extra delay in ms before capturing'),
        fullPage: z.boolean().optional().describe('Capture the full scrollable page instead of just the viewport'),
      },
    },
    async (input) => {
      try {
        const path = await runCaptureScreenshot({
          ...input,
          preset: input.preset as ViewportPreset | undefined,
        });
        return textResult({ path });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_context',
    {
      description:
        'Recommended way to draft: assembles the git activity, project context, voice, and platform strategy bip would send to an LLM, without calling one. Draft the post yourself using this data and your own model, then save it with bip_save_draft.',
      inputSchema: {
        platforms: z.array(z.enum(PLATFORM_NAMES)).optional().describe('Defaults to all platforms'),
        focus: z.string().optional().describe('What this post should emphasize'),
      },
    },
    async (input) => {
      try {
        return textResult(await getDraftContext(input));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  const platformPostSchema = z.object({
    platform: z.enum(PLATFORM_NAMES),
    text: z.string().min(1),
    threadParts: z.array(z.string()).optional().describe('X threads only'),
    title: z.string().optional().describe('Reddit/HackerNews only'),
    url: z.string().optional().describe('HackerNews link posts only'),
  });

  server.registerTool(
    'bip_save_draft',
    {
      description:
        'Save posts you drafted (with bip_context) as a real bip draft. Does not publish anything: use `bip post` to review and publish it.',
      inputSchema: {
        posts: z.array(platformPostSchema).min(1),
        attachments: z.array(z.string()).optional().describe('File paths, e.g. from bip_capture_screenshot'),
      },
    },
    async (input) => {
      try {
        return textResult(runSaveDraft(input));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_draft_preview',
    {
      description:
        'Fallback for when no coding agent is available: generates post drafts from recent git activity using bip\'s own configured LLM key, without saving or publishing anything. Prefer bip_context + bip_save_draft when a coding agent is already running.',
      inputSchema: {
        platforms: z.array(z.enum(PLATFORM_NAMES)).optional().describe('Defaults to all platforms'),
        provider: z.string().optional().describe('AI provider id, e.g. anthropic or glm. Required if multiple API keys are set'),
        focus: z.string().optional().describe('What this post should emphasize'),
      },
    },
    async (input) => {
      try {
        const result = await runDraftPreview(input);
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_evolve_context',
    {
      description:
        'Recommended way to evolve BUILD_IN_PUBLIC.md: assembles the current doc, recent git log, package.json, and posting history bip would send to an LLM, without calling one. Write the updated doc yourself, then save it with bip_evolve_apply.',
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(await getEvolveDocContext());
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_evolve_apply',
    {
      description: 'Saves a BUILD_IN_PUBLIC.md you evolved (with bip_evolve_context) and stamps today\'s date.',
      inputSchema: { content: z.string().min(1) },
    },
    async ({ content }) => {
      try {
        return textResult(applyEvolvedDoc(content));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_soul_context',
    {
      description:
        'Recommended way to evolve soul.md: assembles the current soul.md, edit history, and posting stats bip would send to an LLM, without calling one. Write the updated soul.md yourself, then save it with bip_soul_apply.',
      inputSchema: {},
    },
    async () => {
      try {
        return textResult(getSoulEvolveContext());
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'bip_soul_apply',
    {
      description: 'Saves a soul.md you evolved (with bip_soul_context) and stamps today\'s date.',
      inputSchema: { content: z.string().min(1) },
    },
    async ({ content }) => {
      try {
        return textResult(applyEvolvedSoul(content));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
