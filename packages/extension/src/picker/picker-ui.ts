/**
 * 元素选取层 UI：shadow-root 高亮框 + tooltip + 锁定后面包屑微调。
 * 纯 DOM、无浏览器扩展 API 依赖，jsdom 可测；消息收发由 entrypoints/picker.content.ts 负责。
 */
export interface PickerCallbacks {
  onPick(el: Element): void;
  onCancel(): void;
}

const HOST_ID = 'complift-picker-host';
const TOAST_ID = 'complift-picker-toast';
// 取值即 --blueprint token（docs/rules/ui/rules.md UI-1）；content script 无法引 tokens.css，故内联
const BLUEPRINT = '#1E4FD8';
const MAX_ANCESTORS = 5;
const Z_MAX = '2147483647';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

function labelOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = typeof el.className === 'string' && el.className.trim() !== ''
    ? `.${el.className.trim().split(/\s+/).join('.')}`
    : '';
  return `${tag}${cls}`;
}

function truncate(s: string, max = 24): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function startPicker(doc: Document, cb: PickerCallbacks): { dispose(): void } {
  // 幂等保障：残留旧 host（异常未清理）先移除
  doc.getElementById(HOST_ID)?.remove();

  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    `position:fixed;inset:0 auto auto 0;z-index:${Z_MAX};pointer-events:none;`;
  const shadow = host.attachShadow({ mode: 'open' });

  const highlight = doc.createElement('div');
  highlight.dataset['part'] = 'highlight';
  highlight.style.cssText =
    `position:fixed;display:none;box-sizing:border-box;pointer-events:none;` +
    `border:2px solid ${BLUEPRINT};background:${BLUEPRINT}14;z-index:${Z_MAX};`; // 14 ≈ 8% alpha

  const tooltip = doc.createElement('div');
  tooltip.dataset['part'] = 'tooltip';
  tooltip.style.cssText =
    `position:fixed;display:none;pointer-events:none;font:12px/${1.6} ${MONO};` +
    `background:${BLUEPRINT};color:#fff;padding:1px 6px;border-radius:2px;` +
    `white-space:nowrap;z-index:${Z_MAX};`;

  const breadcrumb = doc.createElement('div');
  breadcrumb.dataset['part'] = 'breadcrumb';
  breadcrumb.style.cssText =
    `position:fixed;display:none;left:0;right:0;bottom:0;pointer-events:auto;` +
    `align-items:center;gap:4px;padding:8px 12px;font:12px ${MONO};` +
    `background:#fff;color:#21211D;border-top:2px solid ${BLUEPRINT};` +
    `box-shadow:0 -2px 8px rgba(0,0,0,.15);z-index:${Z_MAX};overflow-x:auto;`;

  shadow.append(highlight, tooltip, breadcrumb);
  doc.body.appendChild(host);

  let disposed = false;
  let locked = false;
  let target: Element | null = null;
  let rafId: number | null = null;
  let pendingMove: { x: number; y: number } | null = null;

  const view = doc.defaultView;
  const raf = view?.requestAnimationFrame.bind(view) ?? requestAnimationFrame;
  const caf = view?.cancelAnimationFrame.bind(view) ?? cancelAnimationFrame;

  function updateHighlight(el: Element): void {
    const rect = el.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.top = `${rect.top}px`;
    highlight.style.left = `${rect.left}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;

    tooltip.style.display = 'block';
    tooltip.textContent =
      `${labelOf(el)} · ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    tooltip.style.left = `${Math.max(rect.left, 0)}px`;
    tooltip.style.top = `${rect.top >= 24 ? rect.top - 22 : rect.top + rect.height + 2}px`;
  }

  function flushMove(): void {
    rafId = null;
    if (disposed || locked || pendingMove === null) return;
    const { x, y } = pendingMove;
    pendingMove = null;
    const hit = doc.elementFromPoint(x, y);
    // 剔除 host 自身/shadow 内元素（host pointer-events:none，此为兜底）
    if (hit === null || hit === host || hit.getRootNode() === shadow) return;
    if (hit === doc.documentElement || hit === doc.body) return;
    target = hit;
    updateHighlight(hit);
  }

  function onMouseMove(e: MouseEvent): void {
    if (locked) return;
    pendingMove = { x: e.clientX, y: e.clientY };
    if (rafId === null) rafId = raf(flushMove);
  }

  function renderBreadcrumb(lockedEl: Element): void {
    breadcrumb.replaceChildren();

    const chain: Element[] = [];
    let cur: Element | null = lockedEl;
    for (let i = 0; i <= MAX_ANCESTORS && cur !== null; i++) {
      if (cur === doc.body || cur === doc.documentElement) break;
      chain.push(cur);
      cur = cur.parentElement;
    }

    chain.forEach((el, i) => {
      if (i > 0) breadcrumb.append(crumbSep());
      const btn = doc.createElement('button');
      btn.dataset['crumb'] = String(i);
      btn.textContent = truncate(labelOf(el));
      btn.style.cssText =
        `border:1px solid ${el === target ? BLUEPRINT : 'transparent'};cursor:pointer;` +
        `background:none;color:inherit;font:inherit;padding:2px 6px;border-radius:2px;`;
      btn.addEventListener('click', () => {
        target = el;
        updateHighlight(el);
        renderBreadcrumb(lockedEl); // 锚点仍是最初锁定元素，仅换高亮边框
      });
      breadcrumb.append(btn);
    });

    const spacer = doc.createElement('span');
    spacer.style.cssText = 'flex:1;min-width:12px;';
    breadcrumb.append(spacer, actionButton('pick', '✓ Clone', true), actionButton('cancel', '✕', false));
  }

  function crumbSep(): HTMLElement {
    const sep = doc.createElement('span');
    sep.textContent = '‹';
    sep.style.opacity = '0.4';
    return sep;
  }

  function actionButton(action: 'pick' | 'cancel', text: string, primary: boolean): HTMLElement {
    const btn = doc.createElement('button');
    btn.dataset['action'] = action;
    btn.textContent = text;
    btn.style.cssText = primary
      ? `cursor:pointer;border:none;background:${BLUEPRINT};color:#fff;font:inherit;` +
        'padding:4px 12px;border-radius:2px;margin-left:4px;'
      : 'cursor:pointer;border:none;background:none;color:inherit;font:inherit;' +
        'padding:4px 8px;margin-left:2px;';
    btn.addEventListener('click', () => {
      if (action === 'pick') {
        const picked = target;
        dispose();
        if (picked !== null) cb.onPick(picked);
      } else {
        dispose();
        cb.onCancel();
      }
    });
    return btn;
  }

  function onClick(e: MouseEvent): void {
    // 面包屑（shadow 内）上的点击放行给按钮自身的 handler
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopPropagation();
    if (locked || target === null) return;
    locked = true;
    breadcrumb.style.display = 'flex';
    renderBreadcrumb(target);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    dispose();
    cb.onCancel();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (rafId !== null) caf(rafId);
    doc.removeEventListener('mousemove', onMouseMove, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    host.remove();
  }

  doc.addEventListener('mousemove', onMouseMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);

  return { dispose };
}

/** 右上角 toast，2.5s 自动消失；shadow-root 隔离页面样式 */
export function showToast(doc: Document, message: string, isError = false): void {
  doc.getElementById(TOAST_ID)?.remove();
  const host = doc.createElement('div');
  host.id = TOAST_ID;
  host.style.cssText =
    `position:fixed;top:16px;right:16px;z-index:${Z_MAX};pointer-events:none;`;
  const shadow = host.attachShadow({ mode: 'open' });
  const box = doc.createElement('div');
  box.textContent = message;
  // #E8743B = --safety token（变化/error 语义，UI-2）
  box.style.cssText =
    `font:13px ${MONO};color:#fff;padding:8px 14px;border-radius:3px;` +
    `background:${isError ? '#E8743B' : BLUEPRINT};box-shadow:0 2px 8px rgba(0,0,0,.2);`;
  shadow.append(box);
  doc.body.appendChild(host);
  setTimeout(() => host.remove(), 2500);
}
