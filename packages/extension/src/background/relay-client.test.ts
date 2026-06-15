import { describe, expect, it } from 'vitest';
import type { Router } from './router';
import type { RpcRequest, RpcResponse } from '../lib/messages';
import {
  createRelayMessageHandler,
  nextBackoff,
} from './relay-client';

function fakeRouter(handle: (req: RpcRequest) => RpcResponse): {
  router: Router;
  seen: RpcRequest[];
} {
  const seen: RpcRequest[] = [];
  const router: Router = {
    async handle(req) {
      seen.push(req);
      return handle(req);
    },
  };
  return { router, seen };
}

describe('createRelayMessageHandler', () => {
  it('routes a relay:rpc frame through the router and returns ext:rpc-result', async () => {
    const { router, seen } = fakeRouter((req) => ({
      kind: 'complift:rpc-result',
      id: req.id,
      ok: true,
      data: [{ id: 'c1' }] as unknown as RpcResponse['data'],
    }));
    const handle = createRelayMessageHandler(router);

    const reply = await handle({
      kind: 'relay:rpc',
      id: 'r1',
      method: 'component:list',
      params: {},
    });

    expect(seen[0]?.method).toBe('component:list');
    expect(seen[0]?.kind).toBe('complift:rpc');
    expect(reply).toEqual({ kind: 'ext:rpc-result', id: 'r1', ok: true, data: [{ id: 'c1' }], error: undefined });
  });

  it('parses a JSON string frame', async () => {
    const { router } = fakeRouter((req) => ({
      kind: 'complift:rpc-result',
      id: req.id,
      ok: true,
      data: { ok: true } as unknown as RpcResponse['data'],
    }));
    const handle = createRelayMessageHandler(router);
    const reply = await handle(
      JSON.stringify({ kind: 'relay:rpc', id: 'r2', method: 'component:get', params: { componentId: 'x' } }),
    );
    expect(reply?.id).toBe('r2');
    expect(reply?.ok).toBe(true);
  });

  it('propagates a router error result (ok:false) verbatim', async () => {
    const { router } = fakeRouter((req) => ({
      kind: 'complift:rpc-result',
      id: req.id,
      ok: false,
      error: 'not-found',
    }));
    const handle = createRelayMessageHandler(router);
    const reply = await handle({ kind: 'relay:rpc', id: 'r3', method: 'component:get', params: {} });
    expect(reply).toMatchObject({ ok: false, error: 'not-found', id: 'r3' });
  });

  it('wraps a thrown router error into an ext:rpc-result', async () => {
    const { router } = fakeRouter(() => {
      throw new Error('boom');
    });
    const handle = createRelayMessageHandler(router);
    const reply = await handle({ kind: 'relay:rpc', id: 'r4', method: 'component:list', params: {} });
    expect(reply).toMatchObject({ ok: false, error: 'boom', id: 'r4' });
  });

  it('returns null for non relay:rpc / unknown-method / junk frames', async () => {
    const { router, seen } = fakeRouter((req) => ({
      kind: 'complift:rpc-result',
      id: req.id,
      ok: true,
    }));
    const handle = createRelayMessageHandler(router);
    expect(await handle('not json')).toBeNull();
    expect(await handle({ kind: 'ext:hello', version: 1 })).toBeNull();
    expect(await handle({ kind: 'relay:rpc', id: 'x', method: 'bogus:method', params: {} })).toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe('nextBackoff', () => {
  it('grows exponentially from 1s and caps at 30s', () => {
    expect(nextBackoff(0)).toBe(1_000);
    expect(nextBackoff(1)).toBe(2_000);
    expect(nextBackoff(2)).toBe(4_000);
    expect(nextBackoff(5)).toBe(30_000); // 32s capped
    expect(nextBackoff(20)).toBe(30_000);
  });
});
