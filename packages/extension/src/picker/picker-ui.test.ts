import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, startPicker, type PickerCallbacks } from './picker-ui';

const HOST_ID = 'complift-picker-host';

function makeCallbacks() {
  return {
    onPick: vi.fn<PickerCallbacks['onPick']>(),
    onCancel: vi.fn<PickerCallbacks['onCancel']>(),
  } satisfies PickerCallbacks;
}

function mockRect(el: Element, rect: Partial<DOMRect>): void {
  const full: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  };
  el.getBoundingClientRect = () => full;
}

/** 构造 祖父>父>目标 三层结构并 mock elementFromPoint 命中目标 */
function mountTarget(): { target: HTMLElement; parent: HTMLElement; grand: HTMLElement } {
  const grand = document.createElement('section');
  const parent = document.createElement('div');
  parent.className = 'card primary';
  const target = document.createElement('span');
  target.className = 'label';
  parent.appendChild(target);
  grand.appendChild(parent);
  document.body.appendChild(grand);
  document.elementFromPoint = () => target;
  return { target, parent, grand };
}

function host(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}

function shadowQuery(selector: string): HTMLElement {
  const root = host()?.shadowRoot;
  const el = root?.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`shadow 内找不到 ${selector}`);
  return el;
}

function moveMouse(x = 10, y = 10): void {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

function clickPage(): MouseEvent {
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
  document.body.dispatchEvent(evt);
  return evt;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

beforeEach(() => {
  // rAF 立即执行，节流逻辑在单测里同步化
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback): number => {
    fn(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('startPicker — hover 高亮', () => {
  it('mousemove 后高亮框贴合目标元素的 rect', () => {
    const { target } = mountTarget();
    mockRect(target, { top: 20, left: 30, width: 100, height: 40 });
    const session = startPicker(document, makeCallbacks());

    moveMouse();

    const highlight = shadowQuery('[data-part="highlight"]');
    expect(highlight.style.top).toBe('20px');
    expect(highlight.style.left).toBe('30px');
    expect(highlight.style.width).toBe('100px');
    expect(highlight.style.height).toBe('40px');
    session.dispose();
  });

  it('tooltip 显示 tag.class 与尺寸', () => {
    const { target } = mountTarget();
    mockRect(target, { width: 100, height: 40 });
    const session = startPicker(document, makeCallbacks());

    moveMouse();

    const tooltip = shadowQuery('[data-part="tooltip"]');
    expect(tooltip.textContent).toContain('span.label');
    expect(tooltip.textContent).toContain('100');
    expect(tooltip.textContent).toContain('40');
    session.dispose();
  });
});

describe('startPicker — 点击锁定', () => {
  it('click 被 preventDefault 且面包屑出现', () => {
    mountTarget();
    const session = startPicker(document, makeCallbacks());
    moveMouse();

    const evt = clickPage();

    expect(evt.defaultPrevented).toBe(true);
    const breadcrumb = shadowQuery('[data-part="breadcrumb"]');
    expect(breadcrumb.style.display).not.toBe('none');
    session.dispose();
  });

  it('锁定后 mousemove 不再切换目标', () => {
    const { target, parent } = mountTarget();
    mockRect(target, { top: 1, left: 2, width: 3, height: 4 });
    mockRect(parent, { top: 9, left: 9, width: 9, height: 9 });
    const session = startPicker(document, makeCallbacks());
    moveMouse();
    clickPage();

    document.elementFromPoint = () => parent;
    moveMouse(50, 50);

    const highlight = shadowQuery('[data-part="highlight"]');
    expect(highlight.style.top).toBe('1px');
    expect(highlight.style.width).toBe('3px');
    session.dispose();
  });

  it('面包屑点父级再确认，onPick 收到父元素且 host 移除', () => {
    const { parent } = mountTarget();
    const cb = makeCallbacks();
    startPicker(document, cb);
    moveMouse();
    clickPage();

    const crumbs = host()?.shadowRoot?.querySelectorAll('[data-crumb]');
    expect(crumbs?.length).toBeGreaterThanOrEqual(2);
    (crumbs?.[1] as HTMLElement).click(); // index 0 = 自身，1 = 父级
    shadowQuery('[data-action="pick"]').click();

    expect(cb.onPick).toHaveBeenCalledTimes(1);
    expect(cb.onPick.mock.calls[0]?.[0]).toBe(parent);
    expect(host()).toBeNull();
  });
});

describe('startPicker — 取消与清理', () => {
  it('ESC 调 onCancel 且 host 从 DOM 移除', () => {
    mountTarget();
    const cb = makeCallbacks();
    startPicker(document, cb);

    pressEscape();

    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(host()).toBeNull();
  });

  it('面包屑 ✕ 按钮调 onCancel 并清理', () => {
    mountTarget();
    const cb = makeCallbacks();
    startPicker(document, cb);
    moveMouse();
    clickPage();

    shadowQuery('[data-action="cancel"]').click();

    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    expect(host()).toBeNull();
  });

  it('dispose 幂等：重复调用不抛错且 host 已移除', () => {
    mountTarget();
    const session = startPicker(document, makeCallbacks());

    session.dispose();
    expect(host()).toBeNull();
    expect(() => session.dispose()).not.toThrow();
    expect(host()).toBeNull();
  });

  it('dispose 后 ESC / click 不再触发回调（监听已移除）', () => {
    mountTarget();
    const cb = makeCallbacks();
    const session = startPicker(document, cb);
    session.dispose();

    pressEscape();
    const evt = clickPage();

    expect(cb.onCancel).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
  });

  it('重复 startPicker 时先清掉旧 host，只保留一个', () => {
    mountTarget();
    startPicker(document, makeCallbacks());
    const session2 = startPicker(document, makeCallbacks());

    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
    session2.dispose();
    expect(host()).toBeNull();
  });
});

describe('showToast', () => {
  it('显示消息且 2.5s 后自动移除', () => {
    vi.useFakeTimers();
    showToast(document, '✓ Cloned · 打开 complift 面板查看');

    const toastHost = document.getElementById('complift-picker-toast');
    expect(toastHost).not.toBeNull();
    expect(toastHost?.shadowRoot?.textContent).toContain('Cloned');

    vi.advanceTimersByTime(2500);
    expect(document.getElementById('complift-picker-toast')).toBeNull();
    vi.useRealTimers();
  });
});
