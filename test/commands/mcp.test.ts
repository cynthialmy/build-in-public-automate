import { describe, it, expect, vi } from 'vitest';
import { startMcpServer } from '../../src/mcp/server.js';
import { mcpCommand } from '../../src/commands/mcp.js';

vi.mock('../../src/mcp/server.js', () => ({
  startMcpServer: vi.fn().mockResolvedValue(undefined),
}));

describe('mcpCommand', () => {
  it('starts the MCP server', async () => {
    await mcpCommand();
    expect(startMcpServer).toHaveBeenCalled();
  });
});
