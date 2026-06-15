import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  createHub,
  ERR_NOT_CONNECTED,
  ERR_TIMEOUT,
  type Hub,
} from './hub.js';
import { isExtHello, type RelayRpc } from './protocol.js';

/** Simulate the extension end of the ws link against a real loopback hub. */
class FakeExtension {
  readonly ws: WebSocket;
  /** Forwarded relay:rpc frames the hub sent us. */
  readonly received: RelayRpc[] = [];
  private autoReply?: (rpc: RelayRpc) => void;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.kind === 'relay:rpc') {
        this.received.push(msg);
        this.autoReply?.(msg);
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  hello(version = 1): void {
    this.ws.send(JSON.stringify({ kind: 'ext:hello', version }));
  }

  /** Reply with success/failure to each forwarded rpc automatically. */
  reply(handler: (rpc: RelayRpc) => { ok: boolean; data?: unknown; error?: string }): void {
    this.autoReply = (rpc) => {
      const res = handler(rpc);
      this.ws.send(JSON.stringify({ kind: 'ext:rpc-result', id: rpc.id, ...res }));
    };
  }

  close(): void {
    this.ws.close();
  }
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('createHub', () => {
  let hub: Hub;
  const exts: FakeExtension[] = [];

  async function startHub(timeoutMs?: number): Promise<number> {
    hub = createHub(0, { timeoutMs });
    await hub.ready;
    const port = hub.port();
    if (port === undefined) throw new Error('no port');
    return port;
  }

  async function connectExt(port: number): Promise<FakeExtension> {
    const ext = new FakeExtension(port);
    exts.push(ext);
    await ext.open();
    return ext;
  }

  afterEach(async () => {
    for (const ext of exts) ext.close();
    exts.length = 0;
    await hub?.close();
  });

  it('binds 127.0.0.1 and reports a port', async () => {
    const port = await startHub();
    expect(typeof port).toBe('number');
    expect(hub.connected).toBe(false);
  });

  it('flips connected=true after the ext:hello handshake', async () => {
    const port = await startHub();
    const ext = await connectExt(port);
    expect(hub.connected).toBe(false);
    ext.hello();
    await waitFor(() => hub.connected);
    expect(hub.connected).toBe(true);
  });

  it('round-trips a request to the extension and resolves with its data', async () => {
    const port = await startHub();
    const ext = await connectExt(port);
    ext.hello();
    await waitFor(() => hub.connected);
    ext.reply((rpc) => ({ ok: true, data: { echo: rpc.method, params: rpc.params } }));

    const result = await hub.request('component:list', { foo: 1 });
    expect(result).toEqual({ echo: 'component:list', params: { foo: 1 } });
    expect(ext.received[0]?.method).toBe('component:list');
    expect(ext.received[0]?.params).toEqual({ foo: 1 });
  });

  it('rejects with the extension error when ok=false', async () => {
    const port = await startHub();
    const ext = await connectExt(port);
    ext.hello();
    await waitFor(() => hub.connected);
    ext.reply(() => ({ ok: false, error: 'boom' }));

    await expect(hub.request('component:get', {})).rejects.toThrow('boom');
  });

  it('rejects with extension-not-connected when nothing is connected', async () => {
    await startHub();
    await expect(hub.request('component:list', {})).rejects.toThrow(ERR_NOT_CONNECTED);
  });

  it('times out after the configured window when the ext never replies', async () => {
    const port = await startHub(50);
    const ext = await connectExt(port);
    ext.hello();
    await waitFor(() => hub.connected);
    // No reply handler installed -> the request should time out.
    await expect(hub.request('component:list', {})).rejects.toThrow(ERR_TIMEOUT);
  });

  it('supersedes the old connection when a new extension connects', async () => {
    const port = await startHub();
    const first = await connectExt(port);
    first.hello();
    await waitFor(() => hub.connected);

    const firstClosed = new Promise<void>((resolve) => first.ws.once('close', () => resolve()));

    const second = await connectExt(port);
    second.hello();
    await firstClosed; // old socket got closed by the hub
    second.reply((rpc) => ({ ok: true, data: { from: 'second', method: rpc.method } }));

    await waitFor(() => hub.connected);
    const result = await hub.request('component:list', {});
    expect(result).toEqual({ from: 'second', method: 'component:list' });
  });

  it('emits connection-change events and goes false when the ext disconnects', async () => {
    const port = await startHub();
    const states: boolean[] = [];
    hub.onConnectionChange((c) => states.push(c));

    const ext = await connectExt(port);
    ext.hello();
    await waitFor(() => hub.connected);
    ext.close();
    await waitFor(() => !hub.connected);

    expect(states).toEqual([true, false]);
  });

  it('forwards only valid ext:hello frames (ignores junk)', async () => {
    const port = await startHub();
    const ext = await connectExt(port);
    ext.ws.send('not json');
    ext.ws.send(JSON.stringify({ kind: 'something-else' }));
    // Sanity: our type guard still rejects the junk.
    expect(isExtHello({ kind: 'something-else' })).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.connected).toBe(false);
  });
});
