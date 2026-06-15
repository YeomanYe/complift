import { useAdapter, useWorkbench } from './context';
import type { ComponentVersion } from '../lib/types';

const AUTHOR_LABEL: Record<ComponentVersion['author'], string> = {
  capture: '◉ CAPTURE',
  manual: '○ MANUAL',
  agent: '● AGENT',
  rollback: '↩ ROLLBACK',
};

function timeOf(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * Version timeline (seq / author badge / message / time) with per-entry
 * "查看" (pin the old version on the Stage, read-only) and "回滚到此"
 * (component:rollback → new immutable head pointing at old content).
 */
export function HistoryTab(): React.JSX.Element {
  const adapter = useAdapter();
  const history = useWorkbench((s) => s.history);
  const currentVersion = useWorkbench((s) => s.currentVersion);
  const viewVersion = useWorkbench((s) => s.viewVersion);
  const rollback = useWorkbench((s) => s.rollback);

  if (history.length === 0) {
    return <div className="wb-pane-empty">无版本历史</div>;
  }

  // History comes newest-first; seq=N is the head.
  const headSeq = history.reduce((m, v) => Math.max(m, v.seq), 0);

  return (
    <ol className="wb-timeline" data-testid="history-timeline">
      {history.map((v) => {
        const isHead = v.seq === headSeq;
        const isShown = v.id === currentVersion?.id;
        return (
          <li
            key={v.id}
            className={`wb-tl-item is-${v.author} ${isHead ? 'is-head' : ''} ${
              isShown ? 'is-shown' : ''
            }`}
            data-testid="history-entry"
          >
            <span className="wb-tl-tick">v{v.seq}</span>
            <div className="wb-tl-card">
              <div className="wb-tl-row1">
                <span className={`wb-tl-src src-${v.author}`}>{AUTHOR_LABEL[v.author]}</span>
                <span className="wb-tl-time">{timeOf(v.createdAt)}</span>
              </div>
              <p className="wb-tl-msg">{v.message}</p>
              <div className="wb-tl-actions">
                <button
                  type="button"
                  className="wb-tl-btn"
                  data-testid="view-version-btn"
                  onClick={() => void viewVersion(adapter, v.id)}
                >
                  查看
                </button>
                {!isHead && (
                  <button
                    type="button"
                    className="wb-tl-btn wb-tl-rollback"
                    data-testid="rollback-btn"
                    onClick={() => void rollback(adapter, v.id)}
                  >
                    回滚到此
                  </button>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
