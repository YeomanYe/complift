/**
 * 覆盖对比层 UI:把 sandbox 渲染的预览 iframe 绝对定位到页面上原始元素之上,
 * 支持 opacity / mode(overlay | difference) 混合,并随滚动/缩放重定位。
 *
 * 纯 DOM、无浏览器扩展 API 依赖,jsdom 可测;iframe 渲染管线由
 * entrypoints/overlay.content.ts 经 sandbox-protocol 驱动。
 */
export type OverlayMode = 'overlay' | 'difference';

export interface ShowOverlayOptions {
  /** 定位原始元素的 CSS selector(组件捕获时的 sourceSelector)。 */
  selector: string;
  /** sandbox 页面 URL(iframe src),由背景脚本经 adapter.sandboxUrl() 提供。 */
  sandboxUrl: string;
  /** 0..1 的初始不透明度。 */
  opacity: number;
  /** 初始混合模式。 */
  mode: OverlayMode;
  /** 控制条 opacity range 改变时回调(0..1)。 */
  onOpacity?(opacity: number): void;
  /** 控制条 mode 切换时回调。 */
  onMode?(mode: OverlayMode): void;
  /** close 按钮点击时回调(在 host 清理之后调用)。 */
  onClose?(): void;
}

export interface OverlayHandle {
  /** 渲染目标 iframe,content script 据此挂 sandbox client。 */
  iframe: HTMLIFrameElement;
  /** 清理 host + 滚动/缩放监听(幂等)。 */
  hideOverlay(): void;
}

const HOST_ID = 'complift-overlay-host';
// 取值即 --blueprint / --safety token(docs/rules/ui/rules.md UI-1);content script 无法引 tokens.css,故内联
const BLUEPRINT = '#1E4FD8';
const SAFETY = '#E8743B';
const Z_MAX = '2147483647';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

// 模块级唯一活跃 session:重复 showOverlay 时整体清掉旧 session(只删 host 会泄漏旧 window 监听)
let activeSession: { hideOverlay(): void } | null = null;

export function showOverlay(doc: Document, options: ShowOverlayOptions): OverlayHandle {
  const { selector, sandboxUrl } = options;
  const found = doc.querySelector(selector);
  if (found === null) {
    // selector miss:不残留任何 host
    throw new Error(`overlay: selector matched no element: ${selector}`);
  }
  const target: Element = found;

  // 先清掉任何已有 session / 残留 host(异常路径兜底)
  activeSession?.hideOverlay();
  doc.getElementById(HOST_ID)?.remove();

  let opacity = options.opacity;
  let mode: OverlayMode = options.mode;

  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    `position:fixed;inset:0 auto auto 0;z-index:${Z_MAX};pointer-events:none;`;
  const shadow = host.attachShadow({ mode: 'open' });

  // 预览容器(承载 opacity / mix-blend-mode),pointer-events:none 让页面仍可交互
  const frame = doc.createElement('div');
  frame.dataset['part'] = 'frame';
  frame.style.cssText =
    `position:fixed;box-sizing:border-box;pointer-events:none;` +
    `outline:1px dashed ${BLUEPRINT};overflow:hidden;`;

  const iframe = doc.createElement('iframe');
  iframe.dataset['part'] = 'iframe';
  iframe.src = sandboxUrl;
  iframe.title = 'complift overlay preview';
  iframe.style.cssText =
    'border:0;width:100%;height:100%;display:block;pointer-events:none;background:transparent;';
  frame.appendChild(iframe);

  // 控制条(可交互,pointer-events:auto)
  const bar = doc.createElement('div');
  bar.dataset['part'] = 'bar';
  bar.style.cssText =
    `position:fixed;left:50%;bottom:16px;transform:translateX(-50%);` +
    `display:flex;align-items:center;gap:8px;pointer-events:auto;` +
    `padding:6px 10px;font:12px ${MONO};color:#fff;background:${BLUEPRINT};` +
    `border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.25);z-index:${Z_MAX};`;

  const range = doc.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = String(Math.round(opacity * 100));
  range.dataset['action'] = 'opacity';
  range.setAttribute('aria-label', 'overlay opacity');
  range.style.cssText = 'accent-color:#fff;cursor:pointer;';

  const readout = doc.createElement('span');
  readout.dataset['part'] = 'readout';
  readout.style.cssText = 'min-width:34px;text-align:right;';

  const modeBtn = doc.createElement('button');
  modeBtn.type = 'button';
  modeBtn.dataset['action'] = 'mode';
  modeBtn.style.cssText =
    `cursor:pointer;border:none;font:inherit;color:#fff;` +
    `padding:3px 8px;border-radius:3px;background:rgba(255,255,255,.18);`;

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.dataset['action'] = 'close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'close overlay');
  closeBtn.style.cssText =
    `cursor:pointer;border:none;font:inherit;color:#fff;background:${SAFETY};` +
    'padding:3px 8px;border-radius:3px;';

  bar.append(range, readout, modeBtn, closeBtn);
  shadow.append(frame, bar);
  doc.body.appendChild(host);

  function applyVisual(): void {
    frame.style.opacity = String(opacity);
    frame.style.mixBlendMode = mode === 'difference' ? 'difference' : 'normal';
    readout.textContent = `${Math.round(opacity * 100)}%`;
    modeBtn.textContent = mode === 'difference' ? '◫ DIFF' : '◧ OVER';
  }

  function reposition(): void {
    const rect = target.getBoundingClientRect();
    frame.style.top = `${rect.top}px`;
    frame.style.left = `${rect.left}px`;
    frame.style.width = `${rect.width}px`;
    frame.style.height = `${rect.height}px`;
  }

  const view = doc.defaultView ?? window;

  let disposed = false;
  function hide(): void {
    if (disposed) return;
    disposed = true;
    view.removeEventListener('scroll', onReposition, true);
    view.removeEventListener('resize', onReposition);
    host.remove();
    if (activeSession === session) activeSession = null;
  }

  function onReposition(): void {
    if (disposed) return;
    reposition();
  }

  range.addEventListener('input', () => {
    opacity = Number(range.value) / 100;
    applyVisual();
    options.onOpacity?.(opacity);
  });
  modeBtn.addEventListener('click', () => {
    mode = mode === 'difference' ? 'overlay' : 'difference';
    applyVisual();
    options.onMode?.(mode);
  });
  closeBtn.addEventListener('click', () => {
    hide();
    options.onClose?.();
  });

  // scroll 用捕获相,以接收页面内任意可滚动容器的滚动
  view.addEventListener('scroll', onReposition, true);
  view.addEventListener('resize', onReposition);

  applyVisual();
  reposition();

  const session: OverlayHandle = { iframe, hideOverlay: hide };
  activeSession = session;
  return session;
}

/** 模块级清理入口:供 content script 在收到 overlay:hide 时调用(无 handle 也能清)。 */
export function hideOverlay(doc: Document): void {
  if (activeSession !== null) {
    activeSession.hideOverlay();
    return;
  }
  doc.getElementById(HOST_ID)?.remove();
}
