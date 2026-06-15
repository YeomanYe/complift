/**
 * Sandbox live-preview postMessage protocol (host side).
 *
 * Host ↔ MV3 sandbox iframe wire format:
 *   host → sandbox:  { kind: 'complift:render', id, tsx, css }
 *   sandbox → host:  { kind: 'complift:render-result', id, ok, error?, size? }
 *
 * The host `createSandboxClient` correlates render requests by id, applies a
 * timeout, and supersedes any in-flight request when a newer render arrives.
 */

export interface RenderMessage {
  kind: 'complift:render';
  id: string;
  tsx: string;
  css: string;
}

export interface RenderResultMessage {
  kind: 'complift:render-result';
  id: string;
  ok: boolean;
  error?: string;
  size?: { width: number; height: number };
}

/** Resolved value handed back to callers of `render`. */
export interface RenderResult {
  ok: boolean;
  error?: string;
  size?: { width: number; height: number };
}

export const isRenderMessage = (m: unknown): m is RenderMessage => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'complift:render'
    && typeof msg.id === 'string'
    && typeof msg.tsx === 'string'
    && typeof msg.css === 'string';
};

export const isRenderResult = (m: unknown): m is RenderResultMessage => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'complift:render-result'
    && typeof msg.id === 'string'
    && typeof msg.ok === 'boolean';
};

export interface SandboxClientOptions {
  /** Render timeout in ms before resolving with `{ ok: false, error: 'timeout' }`. */
  timeoutMs?: number;
}

export interface SandboxClient {
  /** Compile + render `tsx`/`css` in the sandbox. Supersedes any pending render. */
  render(tsx: string, css: string): Promise<RenderResult>;
  /** Remove the message listener; pending render resolves with `error: 'disposed'`. */
  dispose(): void;
}

const DEFAULT_TIMEOUT_MS = 15_000;

interface Pending {
  id: string;
  resolve: (result: RenderResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createSandboxClient(
  iframe: HTMLIFrameElement,
  options: SandboxClientOptions = {},
): SandboxClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let pending: Pending | null = null;
  let disposed = false;
  let counter = 0;

  const settle = (result: RenderResult) => {
    if (!pending) return;
    clearTimeout(pending.timer);
    const { resolve } = pending;
    pending = null;
    resolve(result);
  };

  const onMessage = (event: MessageEvent) => {
    if (disposed) return;
    // Only accept messages originating from the sandbox iframe's window.
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!isRenderResult(data)) return;
    if (!pending || data.id !== pending.id) return;
    settle({ ok: data.ok, error: data.error, size: data.size });
  };

  window.addEventListener('message', onMessage);

  const render = (tsx: string, css: string): Promise<RenderResult> => {
    // A new render supersedes any previously-pending one.
    settle({ ok: false, error: 'superseded' });

    const id = `render-${Date.now()}-${counter++}`;
    const message: RenderMessage = { kind: 'complift:render', id, tsx, css };

    return new Promise<RenderResult>((resolve) => {
      const timer = setTimeout(() => {
        if (pending?.id === id) settle({ ok: false, error: 'timeout' });
      }, timeoutMs);
      pending = { id, resolve, timer };
      iframe.contentWindow?.postMessage(message, '*');
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('message', onMessage);
    settle({ ok: false, error: 'disposed' });
  };

  return { render, dispose };
}
