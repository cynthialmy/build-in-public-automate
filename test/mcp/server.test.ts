import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../src/mcp/tools.js', () => ({
  getStatusData: vi.fn(() => ({ projectName: 'demo' })),
  getHistoryData: vi.fn((limit?: number) => ({ drafts: [], limit: limit ?? 10 })),
  runCaptureScreenshot: vi.fn(async () => '/tmp/shot.png'),
  runDraftPreview: vi.fn(async () => ({ posts: [] })),
  getDraftContext: vi.fn(async () => ({ context: 'draft' })),
  runSaveDraft: vi.fn(() => ({ draftId: 'abc123' })),
  getEvolveDocContext: vi.fn(async () => ({ context: 'evolve' })),
  applyEvolvedDoc: vi.fn(() => ({ saved: true })),
  getSoulEvolveContext: vi.fn(() => ({ context: 'soul' })),
  applyEvolvedSoul: vi.fn(() => ({ saved: true })),
}));

const { createServer } = await import('../../src/mcp/server.js');
const tools = await import('../../src/mcp/tools.js');

describe('MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists all registered tools', async () => {
    const { tools: list } = await client.listTools();
    const names = list.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'bip_status',
        'bip_history',
        'bip_capture_screenshot',
        'bip_context',
        'bip_save_draft',
        'bip_draft_preview',
        'bip_evolve_context',
        'bip_evolve_apply',
        'bip_soul_context',
        'bip_soul_apply',
      ].sort()
    );
  });

  it('bip_status calls through to getStatusData and returns it as text', async () => {
    const result = await client.callTool({ name: 'bip_status', arguments: {} });
    expect(tools.getStatusData).toHaveBeenCalled();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual({ projectName: 'demo' });
  });

  it('bip_history passes the limit argument through', async () => {
    await client.callTool({ name: 'bip_history', arguments: { limit: 5 } });
    expect(tools.getHistoryData).toHaveBeenCalledWith(5);
  });

  it('bip_capture_screenshot maps preset and returns the file path', async () => {
    const result = await client.callTool({
      name: 'bip_capture_screenshot',
      arguments: { url: 'https://example.com', preset: 'x' },
    });
    expect(tools.runCaptureScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com', preset: 'x' })
    );
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual({ path: '/tmp/shot.png' });
  });

  it('bip_context calls getDraftContext with platforms/focus', async () => {
    await client.callTool({
      name: 'bip_context',
      arguments: { platforms: ['x', 'linkedin'], focus: 'launch' },
    });
    expect(tools.getDraftContext).toHaveBeenCalledWith({
      platforms: ['x', 'linkedin'],
      focus: 'launch',
    });
  });

  it('bip_save_draft calls runSaveDraft with posts/attachments', async () => {
    const result = await client.callTool({
      name: 'bip_save_draft',
      arguments: {
        posts: [{ platform: 'x', text: 'hello world' }],
        attachments: ['/tmp/shot.png'],
      },
    });
    expect(tools.runSaveDraft).toHaveBeenCalled();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text)).toEqual({ draftId: 'abc123' });
  });

  it('bip_draft_preview calls runDraftPreview', async () => {
    await client.callTool({ name: 'bip_draft_preview', arguments: { provider: 'anthropic' } });
    expect(tools.runDraftPreview).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic' })
    );
  });

  it('bip_evolve_context / bip_evolve_apply call through', async () => {
    await client.callTool({ name: 'bip_evolve_context', arguments: {} });
    expect(tools.getEvolveDocContext).toHaveBeenCalled();

    await client.callTool({ name: 'bip_evolve_apply', arguments: { content: 'new doc' } });
    expect(tools.applyEvolvedDoc).toHaveBeenCalledWith('new doc');
  });

  it('bip_soul_context / bip_soul_apply call through', async () => {
    await client.callTool({ name: 'bip_soul_context', arguments: {} });
    expect(tools.getSoulEvolveContext).toHaveBeenCalled();

    await client.callTool({ name: 'bip_soul_apply', arguments: { content: 'new soul' } });
    expect(tools.applyEvolvedSoul).toHaveBeenCalledWith('new soul');
  });

  it('returns an isError result when a tool handler throws', async () => {
    vi.mocked(tools.getStatusData).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const result = await client.callTool({ name: 'bip_status', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe('boom');
  });
});
