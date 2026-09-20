import { startMcpServer } from '../mcp/server.js';

export async function mcpCommand(): Promise<void> {
  await startMcpServer();
}
