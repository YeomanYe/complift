import { useCallback, useEffect, useRef, useState } from 'react';
import { createSandboxClient, whenIframeReady, type SandboxClient } from '../lib/sandbox-protocol';
import type { ComponentVersion } from '../lib/types';
import type { PlatformAdapter } from '../platform/adapter';
import './standalone.css';

export type SandboxClientFactory = (iframe: HTMLIFrameElement) => SandboxClient;

export interface StandaloneProps {
  adapter: PlatformAdapter;
  componentId: string;
  /** Override the sandbox client factory (tests pass a recording stub). */
  sandboxFactory?: SandboxClientFactory;
}

interface Preset {
  id: string;
  label: string;
  /** Fixed iframe width in px, or null for "Fit" (auto-size to render). */
  width: number | null;
}

const PRESETS: Preset[] = [
  { id: '375', label: '375', width: 375 },
  { id: '768', label: '768', width: 768 },
  { id: '1024', label: '1024', width: 1024 },
  { id: '1440', label: '1440', width: 1440 },
  { id: 'fit', label: 'Fit', width: null },
];

/**
 * Standalone preview window (extension page). Reads `componentId` from the URL,
 * fetches the head version via the adapter, renders it into a sandbox iframe,
 * and hot-reloads on `component:changed`. A viewport preset bar swaps the iframe
 * width (375 / 768 / 1024 / 1440 / Fit). Chrome-free — only the adapter seam.
 */
export function Standalone({
  adapter,
  componentId,
  sandboxFactory = createSandboxClient,
}: StandaloneProps): React.JSX.Element {
  const [version, setVersion] = useState<ComponentVersion | null>(null);
  const [name, setName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<string>('1024');
  const [fitSize, setFitSize] = useState<{ width: number; height: number } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const clientRef = useRef<SandboxClient | null>(null);

  const load = useCallback(async () => {
    if (componentId === '') {
      setError('缺少 componentId 参数');
      return;
    }
    try {
      const { component, version: v } = await adapter.rpc('component:get', { componentId });
      setName(component.name);
      setVersion(v);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [adapter, componentId]);

  // Initial fetch.
  useEffect(() => {
    void load();
  }, [load]);

  // Hot-reload when this component changes elsewhere (agent/manual edit).
  useEffect(() => {
    return adapter.onEvent((e) => {
      if (e.kind === 'complift:event' && e.type === 'component:changed' && e.componentId === componentId) {
        void load();
      }
    });
  }, [adapter, componentId, load]);

  // Build the sandbox client once the iframe mounts.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) return;
    const client = sandboxFactory(iframe);
    clientRef.current = client;
    const unsub = client.onSize((_id, s) => setFitSize(s));
    return () => {
      unsub();
      client.dispose();
      clientRef.current = null;
    };
  }, [sandboxFactory]);

  // Render the preview whenever the shown version's files change. Route the first
  // render through whenIframeReady (parity with overlay.content.ts): an opaque
  // cross-origin sandbox waits for the one-shot `load` event (avoids the 15s
  // render timeout), while a reachable, already-loaded iframe (incl. the stubbed
  // path in tests) renders synchronously — no load wait, no hang.
  const tsx = version?.files.tsx ?? '';
  const css = version?.files.css ?? '';
  useEffect(() => {
    const client = clientRef.current;
    const iframe = iframeRef.current;
    if (client === null || iframe === null || version === null) return;
    let cancelled = false;
    const doRender = (): void => {
      if (cancelled) return;
      void client.render(tsx, css).then((res) => {
        if (!cancelled && res.ok && res.size) setFitSize(res.size);
      });
    };
    const cleanup = whenIframeReady(iframe, doRender);
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [version, tsx, css]);

  const preset = PRESETS.find((p) => p.id === presetId);
  // Fixed preset → its px width; "Fit" (width null) → last measured render width.
  const frameWidth = preset?.width != null ? preset.width : fitSize?.width;

  return (
    <div className="st-root" data-testid="standalone">
      <header className="st-bar" data-testid="preset-bar">
        <span className="st-title">{name || 'complift'}</span>
        {version !== null && <span className="st-ver">v{version.seq}</span>}
        <span className="st-spacer" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`st-preset ${p.id === presetId ? 'is-on' : ''}`}
            aria-pressed={p.id === presetId}
            data-preset={p.id}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </header>

      <div className="st-stage">
        {error !== null ? (
          <div className="st-error" role="alert" data-testid="standalone-error">
            {error}
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            className="st-frame"
            title="component preview"
            data-testid="standalone-iframe"
            src={adapter.sandboxUrl()}
            data-tsx={tsx}
            data-css={css}
            style={frameWidth !== undefined ? { width: `${frameWidth}px` } : undefined}
          />
        )}
      </div>
    </div>
  );
}
