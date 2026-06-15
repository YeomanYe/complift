/**
 * complift sandbox page runtime.
 *
 * Runs inside an MV3 sandboxed iframe (CSP allows `unsafe-eval` +
 * `wasm-unsafe-eval`). Receives `complift:render` messages from the host,
 * compiles the supplied TSX with esbuild-wasm, executes the resulting IIFE,
 * and renders the exported component into `#root` with React. Reports back a
 * `complift:render-result` carrying success/error plus the measured size.
 *
 * React / ReactDOM are pre-bundled into this entry and exposed on the global
 * scope so the compiled IIFE (which keeps `react` / `react-dom/client` as
 * externals) can reach them at runtime — no second React copy is shipped.
 */
import React from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import { createRoot, type Root } from 'react-dom/client';
import * as esbuild from 'esbuild-wasm';
import {
  isRenderMessage,
  type RenderResultMessage,
  type RenderSizeMessage,
} from '../../src/lib/sandbox-protocol';

// Bridge real modules to the compiled IIFE via globals (see esbuildBanner).
interface SandboxGlobals {
  __compliftReact: typeof React;
  __compliftReactJsxRuntime: typeof ReactJSXRuntime;
  __compliftCreateRoot: typeof createRoot;
}
const bridge = globalThis as unknown as SandboxGlobals;
bridge.__compliftReact = React;
bridge.__compliftReactJsxRuntime = ReactJSXRuntime;
bridge.__compliftCreateRoot = createRoot;

// Lazily initialize esbuild-wasm once; all renders await the same promise.
let esbuildReady: Promise<void> | null = null;
function ensureEsbuild(): Promise<void> {
  if (!esbuildReady) {
    esbuildReady = esbuild.initialize({ wasmURL: './esbuild.wasm' });
  }
  return esbuildReady;
}

/**
 * Virtual esbuild plugin:
 *  - resolves `react`, `react/jsx-runtime`, `react-dom/client` to the globals
 *    the page already provides (so the bundle stays React-free).
 *  - resolves `*.css` imports to an empty module — the CSS is injected by the
 *    host-provided `css` string, not by the import.
 */
function virtualPlugin(): esbuild.Plugin {
  return {
    name: 'complift-virtual',
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({
        path: 'react',
        namespace: 'global-shim',
      }));
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
        path: 'react/jsx-runtime',
        namespace: 'global-shim',
      }));
      build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({
        path: 'react/jsx-runtime',
        namespace: 'global-shim',
      }));
      build.onResolve({ filter: /^react-dom\/client$/ }, () => ({
        path: 'react-dom/client',
        namespace: 'global-shim',
      }));
      // Any CSS import compiles to a no-op module.
      build.onResolve({ filter: /\.css$/ }, (args) => ({
        path: args.path,
        namespace: 'empty-css',
      }));

      build.onLoad({ filter: /.*/, namespace: 'global-shim' }, (args) => {
        const map: Record<string, string> = {
          react: 'module.exports = globalThis.__compliftReact;',
          'react/jsx-runtime':
            'module.exports = globalThis.__compliftReactJsxRuntime;',
          'react-dom/client':
            'module.exports = { createRoot: globalThis.__compliftCreateRoot };',
        };
        return { contents: map[args.path] ?? 'module.exports = {};', loader: 'js' };
      });

      build.onLoad({ filter: /.*/, namespace: 'empty-css' }, () => ({
        contents: '',
        loader: 'js',
      }));
    },
  };
}

let root: Root | null = null;

function getRootEl(): HTMLElement {
  let el = document.getElementById('root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'root';
    document.body.appendChild(el);
  }
  return el;
}

/** Compute the element's rounded-up pixel size (no observing/reporting). */
function measure(el: HTMLElement): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
}

async function compile(tsx: string): Promise<string> {
  const result = await esbuild.build({
    stdin: { contents: tsx, loader: 'tsx', resolveDir: '/' },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__compliftModule',
    jsx: 'automatic',
    plugins: [virtualPlugin()],
    logLevel: 'silent',
  });
  return result.outputFiles?.[0]?.text ?? '';
}

/**
 * Pick the component to render: prefer the default export, then fall back to
 * the first PascalCase-named function export (the React component convention).
 */
function pickComponent(mod: Record<string, unknown>): unknown {
  if (typeof mod.default === 'function') return mod.default;
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'function' && /^[A-Z]/.test(name)) return value;
  }
  return null;
}

function injectCss(css: string): void {
  const id = 'complift-sandbox-css';
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

function renderError(el: HTMLElement, message: string): void {
  if (root) {
    root.unmount();
    root = null;
  }
  el.innerHTML = '';
  const panel = document.createElement('pre');
  panel.style.cssText =
    'margin:0;padding:12px;font:12px/1.5 ui-monospace,monospace;color:#b00020;white-space:pre-wrap;word-break:break-word;';
  panel.textContent = message;
  el.appendChild(panel);
}

async function handleRender(
  id: string,
  tsx: string,
  css: string,
): Promise<RenderResultMessage> {
  const el = getRootEl();
  try {
    await ensureEsbuild();
    injectCss(css);
    const code = await compile(tsx);

    // Execute the IIFE; `__compliftModule` holds the module's exports.
    const moduleExports = new Function(
      `${code}\nreturn typeof __compliftModule !== 'undefined' ? __compliftModule : {};`,
    )() as Record<string, unknown>;

    const Component = pickComponent(moduleExports);
    if (typeof Component !== 'function') {
      throw new Error(
        'No component export found (expected a default export or a PascalCase-named export).',
      );
    }

    if (!root) root = createRoot(el);
    root.render(React.createElement(Component as React.ComponentType));

    // Allow the commit to flush before measuring.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    // The render succeeded: from now on the ResizeObserver may report sizes
    // for this id.
    lastOkRenderId = id;
    return {
      kind: 'complift:render-result',
      id,
      ok: true,
      size: measure(el),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    renderError(el, message);
    // This render did not succeed: never vouch ok:true for it via resize.
    if (lastOkRenderId === id) lastOkRenderId = null;
    return { kind: 'complift:render-result', id, ok: false, error: message };
  }
}

function post(message: RenderResultMessage | RenderSizeMessage): void {
  // Replies travel back to the embedding host window.
  window.parent?.postMessage(message, '*');
}

// Id of the last render that actually compiled + mounted. Only this id is
// eligible for ResizeObserver size updates; cleared while a render is in
// flight and on failure so we never vouch for an unsuccessful render.
let lastOkRenderId: string | null = null;
const rootEl = getRootEl();
const resizeObserver = new ResizeObserver(() => {
  if (!lastOkRenderId || !root) return;
  post({
    kind: 'complift:render-size',
    id: lastOkRenderId,
    size: measure(rootEl),
  });
});
resizeObserver.observe(rootEl);

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data;
  if (!isRenderMessage(data)) return;
  // Silence size reporting until this render confirms success.
  lastOkRenderId = null;
  void handleRender(data.id, data.tsx, data.css).then(post);
});

// Kick off wasm initialization eagerly so the first render is fast.
void ensureEsbuild();

if (import.meta.env?.DEV) {
  console.log('complift sandbox ready');
}
