import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  isExtHello,
  isExtRpcResult,
  type RelayRpc,
  type RpcMethod,
} from './protocol.js';

/** How long a forwarded RPC waits for an `ext:rpc-result` before rejecting. */
export const REQUEST_TIMEOUT_MS = 10_000;

export const ERR_NOT_CONNECTED = 'extension-not-connected';
export const ERR_TIMEOUT = 'request-timeout';

export interface Hub {
  /** True once an extension has completed the `ext:hello` handshake. */
  readonly connected: boolean;
  /** Subscribe to connection-state changes. Returns an unsubscribe fn. */
  onConnectionChange(listener: (connected: boolean) => void): () => void;
  /**
   * Forward an RPC to the connected extension and resolve with its result.
   * Rejects with `extension-not-connected` if no extension is connected, or
   * `request-timeout` after {@link REQUEST_TIMEOUT_MS}.
   */
  request(method: RpcMethod, params: unknown): Promise<unknown>;
  /** Resolve once the ws server is listening. */
  readonly ready: Promise<void>;
  /** The bound port (useful when port 0 was requested in tests). */
  port(): number | undefined;
  close(): Promise<void>;
}

interface Pending {
  resolve(data: unknown): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HubOptions {
  /** Override the request timeout (mainly for tests). */
  timeoutMs?: number;
  host?: string;
}

/**
 * Create the local ws hub. Binds 127.0.0.1 ONLY (never 0.0.0.0). Accepts a
 * single extension connection; a new connection supersedes (and closes) the
 * previous one.
 */
export function createHub(port: number, options: HubOptions = {}): Hub {
  const host = options.host ?? '127.0.0.1';
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const wss = new WebSocketServer({ host, port });
  const pending = new Map<string, Pending>();
  const connectionListeners = new Set<(connected: boolean) => void>();

  let activeSocket: WebSocket | null = null;
  // Sockets that have completed the `ext:hello` handshake. A socket is only
  // routable once it appears here AND is the current activeSocket. This closes
  // the supersede race: when a 2nd extension connects, activeSocket flips
  // immediately but is NOT in this set until it sends its own hello, so a
  // request() in that window correctly rejects extension-not-connected instead
  // of routing to a not-yet-ready socket.
  const helloed = new WeakSet<WebSocket>();
  let connected = false;

  const ready = new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve());
    wss.once('error', reject);
  });

  const setConnected = (next: boolean): void => {
    if (connected === next) return;
    connected = next;
    for (const listener of connectionListeners) listener(next);
  };

  const rejectAllPending = (err: Error): void => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  wss.on('connection', (socket: WebSocket) => {
    // A new connection supersedes the old one. The new socket is NOT routable
    // until it completes its own `ext:hello`, so drop connection state to false
    // for the supersede window (a request() here rejects extension-not-connected
    // rather than targeting the not-yet-ready new socket).
    const previous = activeSocket;
    activeSocket = socket;
    setConnected(false);
    if (previous !== null && previous !== socket) {
      try {
        previous.close();
      } catch {
        // already closing
      }
    }

    socket.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore non-JSON frames
      }

      if (isExtHello(msg)) {
        helloed.add(socket);
        // Only the currently-active socket drives routable/connected state. A
        // superseded socket's late hello must not flip us back to connected.
        if (activeSocket === socket) setConnected(true);
        return;
      }

      if (isExtRpcResult(msg)) {
        const p = pending.get(msg.id);
        if (p === undefined) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) {
          p.resolve(msg.data);
        } else {
          p.reject(new Error(msg.error ?? 'rpc-error'));
        }
      }
    });

    socket.on('close', () => {
      // Only the currently-active socket drives connection state. A superseded
      // socket closing must not flip us to disconnected.
      if (activeSocket === socket) {
        activeSocket = null;
        setConnected(false);
        rejectAllPending(new Error(ERR_NOT_CONNECTED));
      }
    });

    socket.on('error', () => {
      // surfaced via 'close'
    });
  });

  return {
    get connected() {
      return connected;
    },

    onConnectionChange(listener) {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },

    ready,

    port() {
      const addr = wss.address();
      return addr !== null && typeof addr === 'object' ? addr.port : undefined;
    },

    request(method, params) {
      return new Promise<unknown>((resolve, reject) => {
        const socket = activeSocket;
        if (
          socket === null ||
          !connected ||
          !helloed.has(socket) ||
          socket.readyState !== socket.OPEN
        ) {
          reject(new Error(ERR_NOT_CONNECTED));
          return;
        }

        const id = randomUUID();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(ERR_TIMEOUT));
        }, timeoutMs);

        pending.set(id, { resolve, reject, timer });

        const frame: RelayRpc = { kind: 'relay:rpc', id, method, params };
        try {
          socket.send(JSON.stringify(frame));
        } catch (err) {
          pending.delete(id);
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },

    close() {
      rejectAllPending(new Error(ERR_NOT_CONNECTED));
      return new Promise<void>((resolve) => {
        wss.close(() => resolve());
        for (const client of wss.clients) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
        }
      });
    },
  };
}
