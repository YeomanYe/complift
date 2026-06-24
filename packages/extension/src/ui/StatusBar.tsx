import { useAdapter, useWorkbench } from './context';

/**
 * Top status strip: pick-element toggle + relay connection dot + "MCP :8765" +
 * current version number.
 * (mockup-3 .statusbar — blueprint=static, safety=change semantics.)
 */
export function StatusBar(): React.JSX.Element {
  const adapter = useAdapter();
  const relayConnected = useWorkbench((s) => s.relayConnected);
  const version = useWorkbench((s) => s.currentVersion);
  const picking = useWorkbench((s) => s.picking);
  const togglePicking = useWorkbench((s) => s.togglePicking);

  return (
    <div className="wb-statusbar">
      <div className="wb-sb-left">
        <span className="wb-sb-mark" aria-hidden="true">
          ⌗
        </span>
        <span className="wb-sb-name">COMPLIFT</span>
      </div>
      <div className="wb-sb-right">
        <button
          type="button"
          className={`wb-sb-pick ${picking ? 'is-on' : ''}`}
          aria-pressed={picking}
          data-testid="pick-toggle"
          title="选取页面元素（ESC 取消）"
          onClick={() => void togglePicking(adapter)}
        >
          {picking ? '◉ PICKING…' : '◎ SELECT'}
        </button>
        <span
          className={`wb-sb-relay ${relayConnected ? 'is-on' : 'is-off'}`}
          data-testid="relay-status"
          data-connected={relayConnected}
        >
          <i className={`wb-dot ${relayConnected ? 'wb-dot-on' : 'wb-dot-off'}`} aria-hidden="true" />
          {/* "PLOTTER" is the UI-facing label for what the store/plan call the
              `relay` (local relay / agent connection) — same thing, two names. */}
          {relayConnected ? 'PLOTTER: ONLINE' : 'PLOTTER: OFFLINE'}
        </span>
        <span className="wb-sb-mcp">MCP :8765</span>
        {version !== null && <span className="wb-sb-ver">v{version.seq}</span>}
      </div>
    </div>
  );
}
