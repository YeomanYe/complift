import { useAdapter, useWorkbench } from './context';

/** Short host label from a source URL, e.g. "stripe.com". */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Horizontal film-strip of cloned components (mockup-3 .filmstrip).
 * Selected clip = cobalt-blue (--blueprint) frame. Scrollable, 12+ items.
 */
export function Filmstrip(): React.JSX.Element {
  const adapter = useAdapter();
  const components = useWorkbench((s) => s.components);
  const currentId = useWorkbench((s) => s.currentId);
  const select = useWorkbench((s) => s.select);

  if (components.length === 0) {
    return (
      <div className="wb-filmstrip" role="tablist" aria-label="cloned components">
        <div className="wb-strip-empty">NO CLONES YET — 在页面上选取第一个元素</div>
      </div>
    );
  }

  return (
    <div className="wb-filmstrip" role="tablist" aria-label="cloned components">
      <div className="wb-strip-scroll">
        {components.map((c) => {
          const active = c.id === currentId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`wb-clip ${active ? 'is-active' : ''}`}
              data-testid="filmstrip-clip"
              onClick={() => void select(adapter, c.id)}
            >
              <span className="wb-thumb" aria-hidden="true" />
              <span className="wb-clip-name" title={c.name}>
                {c.name}
              </span>
              <span className="wb-clip-meta">{hostOf(c.sourceUrl)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
