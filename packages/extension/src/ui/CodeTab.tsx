import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { useAdapter, useWorkbench } from './context';

type FileKind = 'tsx' | 'css';

const extensions = [javascript({ jsx: true, typescript: true })];

/**
 * Code inspector: TSX | CSS two-file switch over a CodeMirror editor.
 * cmd/ctrl+S or "Save as v(N+1)" persists via component:update (author 'manual').
 */
export function CodeTab(): React.JSX.Element {
  const adapter = useAdapter();
  const version = useWorkbench((s) => s.currentVersion);
  const viewingHistory = useWorkbench((s) => s.viewingHistory);
  const saveCode = useWorkbench((s) => s.saveCode);

  const [file, setFile] = useState<FileKind>('tsx');
  const [tsx, setTsx] = useState('');
  const [css, setCss] = useState('');
  const [dirty, setDirty] = useState(false);

  // Reset buffers whenever the on-stage version changes. Versions are immutable,
  // so the version id is the correct (and only) trigger — keying on file content
  // too would risk a redundant mid-edit reset.
  const versionId = version?.id ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setTsx(version?.files.tsx ?? '');
    setCss(version?.files.css ?? '');
    setDirty(false);
  }, [versionId]);

  const nextSeq = version ? version.seq + 1 : 1;
  const readOnly = viewingHistory || version === null;

  const save = (): void => {
    if (readOnly) return;
    void saveCode(adapter, tsx, css, `manual edit · v${nextSeq}`);
    setDirty(false);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };

  const value = file === 'tsx' ? tsx : css;
  const fileName = version ? `${version.componentId.slice(0, 8)}.${file}` : `untitled.${file}`;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="wb-codetab" data-testid="code-tab" onKeyDown={onKeyDown}>
      <div className="wb-code-head">
        <div className="wb-file-switch" role="tablist" aria-label="source files">
          <button
            type="button"
            role="tab"
            aria-selected={file === 'tsx'}
            className={`wb-file-btn ${file === 'tsx' ? 'is-active' : ''}`}
            onClick={() => setFile('tsx')}
          >
            TSX
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={file === 'css'}
            className={`wb-file-btn ${file === 'css' ? 'is-active' : ''}`}
            onClick={() => setFile('css')}
          >
            CSS
          </button>
          <span className="wb-code-file">{fileName}</span>
        </div>
        <button
          type="button"
          className="wb-save-btn"
          data-testid="save-btn"
          disabled={readOnly}
          onClick={save}
        >
          {dirty ? '● ' : ''}
          Save as v{nextSeq}
        </button>
      </div>

      {viewingHistory && (
        <div className="wb-readonly-hint" role="status">
          只读：正在查看旧版本，回到 HEAD 后可编辑
        </div>
      )}

      <CodeMirror
        className="wb-cm"
        data-testid={`cm-${file}`}
        value={value}
        height="100%"
        editable={!readOnly}
        readOnly={readOnly}
        extensions={extensions}
        onChange={(next) => {
          if (file === 'tsx') setTsx(next);
          else setCss(next);
          setDirty(true);
        }}
      />
    </div>
  );
}
