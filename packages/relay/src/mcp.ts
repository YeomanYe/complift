import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, type ZodRawShape } from 'zod';
import { ERR_NOT_CONNECTED } from './hub.js';
import type { RpcMethod } from './protocol.js';

/** Minimal slice of the hub the MCP tools depend on (injectable for tests). */
export interface ToolHub {
  request(method: RpcMethod, params: unknown): Promise<unknown>;
}

/** Shape of an MCP CallToolResult (subset we produce). */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface ToolDef<Shape extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Shape;
  /** Map validated args → { method, params } forwarded to the hub. */
  forward(args: z.infer<z.ZodObject<Shape>>): { method: RpcMethod; params: unknown };
}

const text = (value: string): ToolResult['content'][number] => ({ type: 'text', text: value });

const NOT_CONNECTED_GUIDANCE =
  'The complift extension is not connected to the relay. Ask the user to: ' +
  '1) load the complift Chrome extension (pnpm --filter extension dev), and ' +
  '2) open any web page so the extension background can dial the relay. ' +
  'Then retry this tool.';

/**
 * Run a tool: forward to the hub and wrap the result/errors as a
 * CallToolResult. A disconnected extension yields an `isError` result with
 * actionable guidance instead of throwing.
 */
export async function runTool(
  hub: ToolHub,
  def: ToolDef<ZodRawShape>,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { method, params } = def.forward(args as never);
  try {
    const data = await hub.request(method, params);
    return { content: [text(JSON.stringify(data, null, 2))] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === ERR_NOT_CONNECTED) {
      return { content: [text(NOT_CONNECTED_GUIDANCE)], isError: true };
    }
    return { content: [text(`complift error: ${message}`)], isError: true };
  }
}

/** All complift MCP tool definitions. Descriptions are written for the agent. */
export const TOOL_DEFS = [
  {
    name: 'complift_list_components',
    description:
      'List every component captured by complift. Returns id, name, source URL ' +
      'and head version for each. Call this first to discover what is available.',
    inputSchema: {},
    forward: () => ({ method: 'component:list', params: {} }),
  } satisfies ToolDef<Record<string, never>>,

  {
    name: 'complift_get_component',
    description:
      'Get one component plus a version (the head version unless versionId is ' +
      "given). Returns the component metadata and the version's tsx + css files. " +
      'Use this to read the current source before editing.',
    inputSchema: {
      componentId: z.string().describe('The component id (from complift_list_components).'),
      versionId: z
        .string()
        .optional()
        .describe('Optional specific version id; defaults to the head version.'),
    },
    forward: (args) => ({
      method: 'component:get',
      params: { componentId: args.componentId, versionId: args.versionId },
    }),
  } satisfies ToolDef<{ componentId: z.ZodString; versionId: z.ZodOptional<z.ZodString> }>,

  {
    name: 'complift_get_history',
    description:
      'List the full version history of a component, newest changes included. ' +
      'Each entry has a version id, sequence number, author and message. Use a ' +
      'version id here with complift_rollback to revert.',
    inputSchema: {
      componentId: z.string().describe('The component id (from complift_list_components).'),
    },
    forward: (args) => ({
      method: 'component:history',
      params: { componentId: args.componentId },
    }),
  } satisfies ToolDef<{ componentId: z.ZodString }>,

  {
    name: 'complift_update_component',
    description:
      'Write a new version of a component with the given tsx and css. This is ' +
      'how you apply edits: provide the COMPLETE new file contents (not a diff). ' +
      'Authored as "agent". Returns the newly created version.',
    inputSchema: {
      componentId: z.string().describe('The component id to update.'),
      tsx: z.string().describe('The complete new TSX file contents.'),
      css: z.string().describe('The complete new CSS file contents.'),
      message: z.string().describe('Short commit-style message describing the change.'),
    },
    forward: (args) => ({
      method: 'component:update',
      params: {
        componentId: args.componentId,
        tsx: args.tsx,
        css: args.css,
        author: 'agent' as const,
        message: args.message,
      },
    }),
  } satisfies ToolDef<{
    componentId: z.ZodString;
    tsx: z.ZodString;
    css: z.ZodString;
    message: z.ZodString;
  }>,

  {
    name: 'complift_rollback',
    description:
      'Roll a component back to a previous version (by version id from ' +
      'complift_get_history). Creates a new head version restoring those files.',
    inputSchema: {
      componentId: z.string().describe('The component id to roll back.'),
      versionId: z.string().describe('The version id to restore (from complift_get_history).'),
    },
    forward: (args) => ({
      method: 'component:rollback',
      params: { componentId: args.componentId, versionId: args.versionId },
    }),
  } satisfies ToolDef<{ componentId: z.ZodString; versionId: z.ZodString }>,
] as const;

/** Register all complift tools onto an McpServer, forwarding via the hub. */
export function registerTools(server: McpServer, hub: ToolHub): void {
  for (const def of TOOL_DEFS) {
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.inputSchema },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((args: Record<string, unknown>) =>
        runTool(hub, def as ToolDef<ZodRawShape>, args ?? {})) as never,
    );
  }
}

/** Create the complift MCP server (not yet connected to a transport). */
export function createMcpServer(hub: ToolHub): McpServer {
  const server = new McpServer({ name: 'complift-relay', version: '0.1.0' });
  registerTools(server, hub);
  return server;
}
