import { useEffect, useRef, useState } from 'react';
import type { SandboxClient } from '../lib/sandbox-protocol';
import { useAdapter, useSandboxFactory, useWorkbench } from './context';

export interface OverlayControls {
  enabled: boolean;
  opacity: number;
  mode: 'overlay' | 'difference';
}

/**
 * Grid-paper stage with a centered sandbox iframe driven by the injected
 * sandbox-client factory. On version change it re-renders the live preview
 * (= hot-reload when an agent edits code). Width/height annotations frame the
 * render; a tool rail hosts overlay opacity / difference / page+window actions.
 *
 * The iframe `src` is `adapter.sandboxUrl()`; the render channel comes from the
 * injected factory (real postMessage client in the extension, a recording stub
 * in tests) — no env branching.
 */
export function Stage(): React.JSX.Element {
  const adapter = useAdapter();
  const sandboxFactory = useSandboxFactory();
  const version = useWorkbench((s) => s.currentVersion);
  const viewingHistory = useWorkbench((s) => s.viewingHistory);
  const state = useWorkbench((s) => s.state);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const clientRef = useRef<SandboxClient | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const [overlay, setOverlay] = useState<OverlayControls>({
    enabled: false,
    opacity: 50,
    mode: 'overlay',
  });

  // Build the sandbox client once the iframe mounts; subscribe to size updates.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) return;
    const client = sandboxFactory(iframe);
    clientRef.current = client;
    const unsub = client.onSize((_id, s) => setSize(s));
    return () => {
      unsub();
      client.dispose();
      clientRef.current = null;
    };
  }, [sandboxFactory]);

  // Re-render the preview whenever the shown version's files change.
  const tsx = version?.files.tsx ?? '';
  const css = version?.files.css ?? '';
  useEffect(() => {
    const client = clientRef.current;
    if (client === null || version === null) return;
    void client.render(tsx, css).then((res) => {
      if (res.ok && res.size) setSize(res.size);
    });
  }, [version, tsx, css]);

  // Drive overlay compare through the adapter (no chrome dependency).
  // Skip the hide RPC unless the overlay was actually turned on at some point —
  // otherwise every mount / component switch would fire a pointless overlay:hide.
  const overlayWasEnabled = useRef(false);
  useEffect(() => {
    const componentId = version?.componentId;
    if (componentId === undefined) return;
    if (overlay.enabled) {
      overlayWasEnabled.current = true;
      void adapter.rpc('overlay:show', {
        componentId,
        opacity: overlay.opacity / 100,
        mode: overlay.mode,
      });
    } else if (overlayWasEnabled.current) {
      // Only hide if it had previously been enabled (real disable path).
      overlayWasEnabled.current = false;
      void adapter.rpc('overlay:hide', {});
    }
  }, [adapter, overlay, version?.componentId]);

  const dimW = size?.width;
  const dimH = size?.height;

  return (
    <div className="wb-stage" data-testid="stage" data-state={state}>
      <div className="wb-stage-canvas">
        {viewingHistory && version !== null && (
          <div className="wb-history-hint" role="status">
            VIEWING v{version.seq} · 只读
          </div>
        )}
        {dimW !== undefined && (
          <div className="wb-dim wb-dim-w" data-testid="dim-width">
            <span className="wb-dim-label">{Math.round(dimW)}</span>
          </div>
        )}
        {dimH !== undefined && (
          <div className="wb-dim wb-dim-h" data-testid="dim-height">
            <span className="wb-dim-label">{Math.round(dimH)}</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          className="wb-sandbox"
          title="component preview"
          data-testid="stage-iframe"
          src={adapter.sandboxUrl()}
          data-tsx={tsx}
          data-css={css}
        />
      </div>

      <div className="wb-toolrail" data-testid="toolrail">
        <button
          type="button"
          className={`wb-tr-toggle ${overlay.enabled ? 'is-on' : ''}`}
          aria-pressed={overlay.enabled}
          onClick={() => setOverlay((o) => ({ ...o, enabled: !o.enabled }))}
        >
          ◧ OVERLAY ON PAGE
        </button>
        <input
          type="range"
          className="wb-tr-slider"
          min={0}
          max={100}
          value={overlay.opacity}
          aria-label="overlay opacity"
          onChange={(e) => setOverlay((o) => ({ ...o, opacity: Number(e.target.value) }))}
        />
        <span className="wb-tr-readout">{overlay.opacity}%</span>
        <button
          type="button"
          className={`wb-tr-toggle ${overlay.mode === 'difference' ? 'is-on' : ''}`}
          aria-pressed={overlay.mode === 'difference'}
          onClick={() =>
            setOverlay((o) => ({
              ...o,
              mode: o.mode === 'difference' ? 'overlay' : 'difference',
            }))
          }
        >
          ◫ DIFFERENCE
        </button>
        <span className="wb-tr-spacer" />
        <button
          type="button"
          className="wb-tr-toggle wb-tr-window"
          disabled
          title="独立预览窗 (Task 10)"
        >
          ⤢ OPEN WINDOW
        </button>
      </div>
    </div>
  );
}
