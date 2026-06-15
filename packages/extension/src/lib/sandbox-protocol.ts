/**
 * Sandbox live-preview postMessage protocol (host side).
 *
 * Host ↔ MV3 sandbox iframe wire format:
 *   host → sandbox:  { kind: 'complift:render', id, tsx, css }
 *   sandbox → host:  { kind: 'complift:render-result', id, ok, error?, size? }
 *   sandbox → host:  { kind: 'complift:render-size', id, size }
 *
 * `render-result` is the one-shot outcome of a render request (carrying the
 * initial measured size on success). `render-size` is a follow-up stream of
 * layout updates emitted by the sandbox's ResizeObserver for the last
 * successful render — the host subscribes to these via `onSize` for auto-sizing.
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

/** Follow-up size update for the last successful render (ResizeObserver). */
export interface RenderSizeMessage {
  kind: 'complift:render-size';
  id: string;
  size: { width: number; height: number };
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

export const isRenderSize = (m: unknown): m is RenderSizeMessage => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  if (msg.kind !== 'complift:render-size' || typeof msg.id !== 'string') return false;
  const size = msg.size as Record<string, unknown> | null | undefined;
  return typeof size === 'object' && size !== null
    && typeof size.width === 'number'
    && typeof size.height === 'number';
};

/**
 * Run `cb` once the sandbox `iframe` is ready to receive a render request.
 *
 * The production sandbox is a chrome-extension sandboxed page rendered in an
 * opaque cross-origin context: `contentDocument` is `null`/throws until it has
 * navigated, so we gate the first render on the one-shot `load` event (parity
 * with overlay.content.ts — avoids relying on the 15s render timeout).
 *
 * When the iframe's document IS reachable (a same-origin / stubbed iframe, e.g.
 * jsdom in tests, where the `load` event may never fire), there is no cross-doc
 * navigation to await, so `cb` runs synchronously — the stub path never hangs.
 * Returns a cleanup function that detaches the pending listener.
 */
export function whenIframeReady(iframe: HTMLIFrameElement, cb: () => void): () => void {
  let docReachable = false;
  try {
    docReachable = iframe.contentDocument != null;
  } catch {
    // SecurityError → genuinely cross-origin sandbox still loading.
    docReachable = false;
  }
  if (docReachable) {
    cb();
    return () => {};
  }
  const onLoad = (): void => cb();
  iframe.addEventListener('load', onLoad, { once: true });
  return () => iframe.removeEventListener('load', onLoad);
}

export interface SandboxClientOptions {
  /** Render timeout in ms before resolving with `{ ok: false, error: 'timeout' }`. */
  timeoutMs?: number;
}

/** Callback receiving ongoing size updates for a rendered component. */
export type SizeListener = (
  id: string,
  size: { width: number; height: number },
) => void;

export interface SandboxClient {
  /** Compile + render `tsx`/`css` in the sandbox. Supersedes any pending render. */
  render(tsx: string, css: string): Promise<RenderResult>;
  /** Subscribe to ongoing `render-size` updates. Returns an unsubscribe fn. */
  onSize(cb: SizeListener): () => void;
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
  const sizeListeners = new Set<SizeListener>();

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
    if (isRenderSize(data)) {
      for (const cb of sizeListeners) cb(data.id, data.size);
      return;
    }
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

  const onSize = (cb: SizeListener): (() => void) => {
    sizeListeners.add(cb);
    return () => {
      sizeListeners.delete(cb);
    };
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('message', onMessage);
    sizeListeners.clear();
    settle({ ok: false, error: 'disposed' });
  };

  return { render, onSize, dispose };
}
