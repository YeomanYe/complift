import type { Router } from './router';
import type { RpcMethod, RpcRequest } from '../lib/messages';
import { RPC_METHODS } from '../lib/messages';

/**
 * Extension-side client for the local complift relay (see packages/relay).
 *
 * The extension is the WebSocket CLIENT: the background service worker dials OUT
 * to the relay's ws server on 127.0.0.1. On connect it announces itself with
 * `ext:hello`; the relay then forwards MCP tool calls as `relay:rpc` frames,
 * which we feed into the existing RPC router and answer with `ext:rpc-result`.
 *
 * Wire protocol (mirror of packages/relay/src/protocol.ts):
 *   background → relay:  { kind: 'ext:hello', version }
 *   relay → background:  { kind: 'relay:rpc', id, method, params }
 *   background → relay:  { kind: 'ext:rpc-result', id, ok, data?, error? }
 */

export const DEFAULT_RELAY_URL = 'ws://127.0.0.1:8765';
export const HELLO_VERSION = 1;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface RelayRpcFrame {
  kind: 'relay:rpc';
  id: string;
  method: RpcMethod;
  params: unknown;
}

export interface ExtRpcResultFrame {
  kind: 'ext:rpc-result';
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const isRelayRpcFrame = (m: unknown): m is RelayRpcFrame => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return (
    msg.kind === 'relay:rpc' &&
    typeof msg.id === 'string' &&
    typeof msg.method === 'string' &&
    (RPC_METHODS as readonly string[]).includes(msg.method)
  );
};

/**
 * Pure message handler: given a raw ws frame, returns the `ext:rpc-result` to
 * send back, or `null` if the frame is not a `relay:rpc` we handle. Routes the
 * call through the shared {@link Router}. Unit-testable with a fake router — no
 * socket required.
 */
export function createRelayMessageHandler(router: Router) {
  return async function handleRelayMessage(raw: unknown): Promise<ExtRpcResultFrame | null> {
    let msg: unknown = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (!isRelayRpcFrame(msg)) return null;

    const req: RpcRequest = {
      kind: 'complift:rpc',
      id: msg.id,
      method: msg.method,
      params: msg.params as RpcRequest['params'],
    };
    try {
      const res = await router.handle(req);
      return {
        kind: 'ext:rpc-result',
        id: msg.id,
        ok: res.ok,
        data: res.data,
        error: res.error,
      };
    } catch (err) {
      return {
        kind: 'ext:rpc-result',
        id: msg.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/** Compute the next exponential backoff delay (1s → 30s cap). */
export function nextBackoff(attempt: number): number {
  const delay = RECONNECT_MIN_MS * 2 ** Math.max(0, attempt);
  return Math.min(delay, RECONNECT_MAX_MS);
}

export interface RelayClientOptions {
  router: Router;
  /** Called whenever the connection state changes (drives StatusBar dot). */
  onStatusChange(connected: boolean): void;
  url?: string;
  /** Injectable WebSocket ctor (defaults to global) — eases testing. */
  WebSocketImpl?: typeof WebSocket;
}

export interface RelayClient {
  /** Whether we currently have an open, hello'd connection. */
  connected(): boolean;
  stop(): void;
}

/**
 * Start the relay client: dials the relay, sends `ext:hello`, routes incoming
 * `relay:rpc` frames, and reconnects with exponential backoff (1s → 30s) when
 * the socket drops or fails to open. Connection-state transitions are reported
 * via `onStatusChange`.
 */
export function startRelayClient(options: RelayClientOptions): RelayClient {
  const url = options.url ?? DEFAULT_RELAY_URL;
  const WS = options.WebSocketImpl ?? WebSocket;
  const handle = createRelayMessageHandler(options.router);

  let socket: WebSocket | null = null;
  let connected = false;
  let attempt = 0;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const setConnected = (next: boolean): void => {
    if (connected === next) return;
    connected = next;
    options.onStatusChange(next);
  };

  const scheduleReconnect = (): void => {
    if (stopped) return;
    const delay = nextBackoff(attempt);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect(): void {
    if (stopped) return;
    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;

    ws.addEventListener('open', () => {
      attempt = 0;
      try {
        ws.send(JSON.stringify({ kind: 'ext:hello', version: HELLO_VERSION }));
      } catch {
        // send failure surfaces via 'close'/'error'
      }
      setConnected(true);
    });

    ws.addEventListener('message', (event: MessageEvent) => {
      void handle(event.data).then((reply) => {
        if (reply !== null && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(reply));
        }
      });
    });

    ws.addEventListener('close', () => {
      if (socket === ws) socket = null;
      setConnected(false);
      scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      // Some runtimes fire 'error' without 'close'; close() to converge.
      try {
        ws.close();
      } catch {
        // ignore
      }
    });
  }

  connect();

  return {
    connected: () => connected,
    stop() {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      setConnected(false);
      if (socket !== null) {
        try {
          socket.close();
        } catch {
          // ignore
        }
        socket = null;
      }
    },
  };
}
