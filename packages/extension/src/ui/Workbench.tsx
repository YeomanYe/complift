import { useEffect, useState } from 'react';
import type { PlatformAdapter } from '../platform/adapter';
import { CodeTab } from './CodeTab';
import { Filmstrip } from './Filmstrip';
import { HistoryTab } from './HistoryTab';
import { Stage } from './Stage';
import { StatusBar } from './StatusBar';
import {
  useAdapter,
  useWorkbench,
  WorkbenchProvider,
  type SandboxClientFactory,
} from './context';
import './tokens.css';
import './workbench.css';

type InspectorTab = 'code' | 'history';

function Inspector(): React.JSX.Element {
  const [tab, setTab] = useState<InspectorTab>('code');
  return (
    <div className="wb-inspector">
      <div className="wb-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'code'}
          className={`wb-tab ${tab === 'code' ? 'is-active' : ''}`}
          onClick={() => setTab('code')}
        >
          CODE
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`wb-tab ${tab === 'history' ? 'is-active' : ''}`}
          onClick={() => setTab('history')}
        >
          HISTORY
        </button>
      </div>
      <div className="wb-pane">{tab === 'code' ? <CodeTab /> : <HistoryTab />}</div>
    </div>
  );
}

/** Inner shell — reads context; renders the four panel states. */
function WorkbenchShell(): React.JSX.Element {
  const adapter = useAdapter();
  const load = useWorkbench((s) => s.load);
  const refreshCurrent = useWorkbench((s) => s.refreshCurrent);
  const setRelayConnected = useWorkbench((s) => s.setRelayConnected);
  const state = useWorkbench((s) => s.state);
  const error = useWorkbench((s) => s.error);
  const currentId = useWorkbench((s) => s.currentId);

  // Initial load.
  useEffect(() => {
    void load(adapter);
  }, [adapter, load]);

  // Event wiring: agent/manual edits hot-reload the stage; relay status → StatusBar.
  useEffect(() => {
    const unsub = adapter.onEvent((e) => {
      if (e.type === 'relay:status') {
        setRelayConnected(e.connected);
        return;
      }
      if (e.type === 'component:changed' && e.componentId === currentId) {
        void refreshCurrent(adapter);
        return;
      }
      if (e.type === 'component:created' || e.type === 'picker:picked') {
        // A new clone appeared — pull it onto the stage.
        void load(adapter);
      }
    });
    return unsub;
  }, [adapter, currentId, load, refreshCurrent, setRelayConnected]);

  return (
    <section className="wb-panel" data-state={state} aria-label="complift drafting bench">
      <StatusBar />
      <Filmstrip />
      <Stage />
      {state === 'error' ? (
        <div className="wb-inspector wb-inspector-error" role="alert">
          <div className="wb-error-card">
            <div className="wb-ec-head">EXTRACTION FAILED</div>
            <p className="wb-ec-body">{error ?? '未知错误'}</p>
            <button type="button" className="wb-ec-retry" onClick={() => void load(adapter)}>
              RETRY
            </button>
          </div>
        </div>
      ) : state === 'empty' ? (
        <div className="wb-inspector wb-inspector-empty">
          <p className="wb-empty-title">NO COMPONENT ON STAGE</p>
          <p className="wb-empty-sub">去页面选取一个元素开始</p>
        </div>
      ) : (
        <Inspector />
      )}
    </section>
  );
}

export interface WorkbenchProps {
  adapter: PlatformAdapter;
  /** Test seam: override the sandbox client factory (see WorkbenchProvider). */
  sandboxFactory?: SandboxClientFactory;
}

/** Drafting Bench workbench root. Adapter injected via props (zero chrome dep). */
export function Workbench({ adapter, sandboxFactory }: WorkbenchProps): React.JSX.Element {
  return (
    <WorkbenchProvider adapter={adapter} sandboxFactory={sandboxFactory}>
      <WorkbenchShell />
    </WorkbenchProvider>
  );
}
