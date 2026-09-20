import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VIEWPORT_PRESETS, type ViewportPreset } from '../capture/screenshot.js';
import {
  getStatusData,
  getHistoryData,
  runCaptureScreenshot,
  runDraftPreview,
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
    'bip_draft_preview',
    {
      description:
        'Generate post drafts from recent git activity for one or more platforms, without saving or publishing anything. Use bip_status/bip_history to inspect saved drafts, and the bip CLI (`bip draft`, `bip post`) to actually save and publish — those steps require interactive review.',
      inputSchema: {
        platforms: z.array(z.enum(PLATFORM_NAMES)).optional().describe('Defaults to all platforms'),
        provider: z.string().optional().describe('AI provider id, e.g. anthropic, glm — required if multiple API keys are set'),
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

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
