import { describe, expect, it } from 'vitest';
import { ERR_NOT_CONNECTED } from './hub.js';
import type { RpcMethod } from './protocol.js';
import { TOOL_DEFS, type ToolHub, runTool } from './mcp.js';

interface Call {
  method: RpcMethod;
  params: unknown;
}

/** In-memory fake hub that records calls and returns/throws a canned result. */
function fakeHub(behaviour: (call: Call) => unknown): { hub: ToolHub; calls: Call[] } {
  const calls: Call[] = [];
  const hub: ToolHub = {
    async request(method, params) {
      calls.push({ method, params });
      const out = behaviour({ method, params });
      if (out instanceof Error) throw out;
      return out;
    },
  };
  return { hub, calls };
}

const defByName = (name: string) => {
  const def = TOOL_DEFS.find((d) => d.name === name);
  if (def === undefined) throw new Error(`no tool ${name}`);
  return def;
};

describe('complift MCP tools → hub mapping', () => {
  it('complift_list_components forwards component:list with empty params', async () => {
    const { hub, calls } = fakeHub(() => [{ id: 'c1' }]);
    const res = await runTool(hub, defByName('complift_list_components') as never, {});
    expect(calls).toEqual([{ method: 'component:list', params: {} }]);
    expect(res.isError).toBeUndefined();
    expect(res.content[0]?.text).toContain('c1');
  });

  it('complift_get_component forwards componentId + optional versionId', async () => {
    const { hub, calls } = fakeHub(() => ({ component: {}, version: {} }));
    await runTool(hub, defByName('complift_get_component') as never, {
      componentId: 'abc',
      versionId: 'v2',
    });
    expect(calls[0]).toEqual({
      method: 'component:get',
      params: { componentId: 'abc', versionId: 'v2' },
    });
  });

  it('complift_get_history forwards componentId to component:history', async () => {
    const { hub, calls } = fakeHub(() => []);
    await runTool(hub, defByName('complift_get_history') as never, { componentId: 'abc' });
    expect(calls[0]).toEqual({ method: 'component:history', params: { componentId: 'abc' } });
  });

  it('complift_update_component forwards tsx/css/message with author=agent', async () => {
    const { hub, calls } = fakeHub(() => ({ id: 'v3' }));
    await runTool(hub, defByName('complift_update_component') as never, {
      componentId: 'abc',
      tsx: 'export const X = () => null;',
      css: '.x{}',
      message: 'tweak',
    });
    expect(calls[0]).toEqual({
      method: 'component:update',
      params: {
        componentId: 'abc',
        tsx: 'export const X = () => null;',
        css: '.x{}',
        author: 'agent',
        message: 'tweak',
      },
    });
  });

  it('complift_rollback forwards componentId + versionId to component:rollback', async () => {
    const { hub, calls } = fakeHub(() => ({ id: 'v4' }));
    await runTool(hub, defByName('complift_rollback') as never, {
      componentId: 'abc',
      versionId: 'v1',
    });
    expect(calls[0]).toEqual({
      method: 'component:rollback',
      params: { componentId: 'abc', versionId: 'v1' },
    });
  });

  it('returns an isError result with guidance when the extension is not connected', async () => {
    const { hub } = fakeHub(() => new Error(ERR_NOT_CONNECTED));
    const res = await runTool(hub, defByName('complift_list_components') as never, {});
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toMatch(/not connected/i);
    expect(res.content[0]?.text).toMatch(/load the complift/i);
  });

  it('wraps other hub errors as a non-fatal isError result', async () => {
    const { hub } = fakeHub(() => new Error('not-found'));
    const res = await runTool(hub, defByName('complift_get_component') as never, {
      componentId: 'missing',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('not-found');
  });

  it('exposes exactly the five documented tools with agent-facing descriptions', () => {
    expect(TOOL_DEFS.map((d) => d.name)).toEqual([
      'complift_list_components',
      'complift_get_component',
      'complift_get_history',
      'complift_update_component',
      'complift_rollback',
    ]);
    for (const def of TOOL_DEFS) {
      expect(def.description.length).toBeGreaterThan(20);
    }
  });
});
