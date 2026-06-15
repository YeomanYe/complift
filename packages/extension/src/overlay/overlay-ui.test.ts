import { afterEach, describe, expect, it } from 'vitest';
import { hideOverlay, showOverlay, type ShowOverlayOptions } from './overlay-ui';

const HOST_ID = 'complift-overlay-host';

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

function mountTarget(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pricing card';
  document.body.appendChild(el);
  mockRect(el, rect);
  return el;
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

function opts(over: Partial<ShowOverlayOptions> = {}): ShowOverlayOptions {
  return {
    selector: 'div.pricing.card',
    sandboxUrl: '/sandbox.html',
    opacity: 0.5,
    mode: 'overlay',
    ...over,
  };
}

afterEach(() => {
  hideOverlay(document);
  document.body.innerHTML = '';
});

describe('showOverlay — 定位与尺寸', () => {
  it('① iframe 容器尺寸/位置贴合目标元素 rect', () => {
    mountTarget({ top: 40, left: 60, width: 320, height: 420 });
    showOverlay(document, opts());

    const frame = shadowQuery('[data-part="frame"]');
    expect(frame.style.top).toBe('40px');
    expect(frame.style.left).toBe('60px');
    expect(frame.style.width).toBe('320px');
    expect(frame.style.height).toBe('420px');

    const iframe = shadowQuery('iframe') as HTMLIFrameElement;
    expect(iframe.src).toContain('/sandbox.html');
    expect(iframe.style.pointerEvents).toBe('none');
  });
});

describe('showOverlay — opacity 与 mode', () => {
  it('② opacity 应用到 iframe 容器', () => {
    mountTarget({ width: 100, height: 100 });
    showOverlay(document, opts({ opacity: 0.3 }));

    const frame = shadowQuery('[data-part="frame"]');
    expect(frame.style.opacity).toBe('0.3');
    expect(frame.style.mixBlendMode).toBe('normal');
  });

  it("mode:'difference' 设置 mix-blend-mode:difference", () => {
    mountTarget({ width: 100, height: 100 });
    showOverlay(document, opts({ mode: 'difference' }));

    const frame = shadowQuery('[data-part="frame"]');
    expect(frame.style.mixBlendMode).toBe('difference');
  });

  it('range / mode 控件交互回调 onOpacity / onMode', () => {
    mountTarget({ width: 100, height: 100 });
    const changes: { opacity?: number; mode?: string } = {};
    showOverlay(
      document,
      opts({
        onOpacity: (v) => (changes.opacity = v),
        onMode: (m) => (changes.mode = m),
      }),
    );

    const range = shadowQuery('input[type="range"]') as HTMLInputElement;
    range.value = '80';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes.opacity).toBeCloseTo(0.8);

    shadowQuery('[data-action="mode"]').click();
    expect(changes.mode).toBe('difference');
  });
});

describe('showOverlay — 清理', () => {
  it('③ hideOverlay 清掉 host 与监听', () => {
    mountTarget({ width: 100, height: 100 });
    const handle = showOverlay(document, opts());
    expect(host()).not.toBeNull();

    handle.hideOverlay();
    expect(host()).toBeNull();
    // 幂等
    expect(() => handle.hideOverlay()).not.toThrow();
    expect(() => hideOverlay(document)).not.toThrow();
  });

  it('close 控件按钮调 onClose 并清理', () => {
    mountTarget({ width: 100, height: 100 });
    let closed = false;
    showOverlay(document, opts({ onClose: () => (closed = true) }));

    shadowQuery('[data-action="close"]').click();

    expect(closed).toBe(true);
    expect(host()).toBeNull();
  });

  it('重复 showOverlay 只保留一个 host', () => {
    mountTarget({ width: 100, height: 100 });
    showOverlay(document, opts());
    showOverlay(document, opts());
    expect(document.querySelectorAll(`#${HOST_ID}`).length).toBe(1);
  });
});

describe('showOverlay — selector miss', () => {
  it('④ 找不到目标元素时抛错且不残留 host', () => {
    expect(() => showOverlay(document, opts({ selector: '.does-not-exist' }))).toThrow(
      /selector/i,
    );
    expect(host()).toBeNull();
  });
});

describe('showOverlay — 滚动/缩放重定位', () => {
  it('scroll 后容器重新贴合目标新 rect', () => {
    const el = mountTarget({ top: 40, left: 60, width: 320, height: 420 });
    showOverlay(document, opts());

    mockRect(el, { top: 10, left: 20, width: 320, height: 420 });
    window.dispatchEvent(new Event('scroll'));

    const frame = shadowQuery('[data-part="frame"]');
    expect(frame.style.top).toBe('10px');
    expect(frame.style.left).toBe('20px');
  });
});
