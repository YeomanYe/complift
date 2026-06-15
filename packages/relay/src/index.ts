#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createHub } from './hub.js';
import { createMcpServer } from './mcp.js';

const DEFAULT_PORT = 8765;

/** stdout is reserved for the MCP protocol; all logs go to stderr. */
function log(...args: unknown[]): void {
  console.error('[complift-relay]', ...args);
}

function resolvePort(): number {
  const raw = process.env.COMPLIFT_PORT;
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    log(`invalid COMPLIFT_PORT="${raw}", falling back to ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

export async function main(): Promise<void> {
  const port = resolvePort();
  const hub = createHub(port);

  hub.onConnectionChange((connected) => {
    log(connected ? 'extension connected' : 'extension disconnected');
  });

  try {
    await hub.ready;
  } catch (err) {
    log('failed to bind ws hub:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }
  log(`ws hub listening on 127.0.0.1:${hub.port() ?? port}`);

  const server = createMcpServer(hub);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP stdio server ready');

  const shutdown = (signal: string): void => {
    log(`received ${signal}, shutting down`);
    void hub.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  log('fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
