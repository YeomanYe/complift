import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSandboxClient,
  isRenderMessage,
  isRenderResult,
  isRenderSize,
  whenIframeReady,
} from './sandbox-protocol';
import type { RenderResult } from './sandbox-protocol';

/** 构造假 iframe：只需要 contentWindow.postMessage 可被 spy。 */
function makeFakeIframe() {
  const postMessage = vi.fn();
  const contentWindow = { postMessage };
  // 测试替身：只用到 contentWindow，类型系统推不出它是真 iframe
  const iframe = { contentWindow } as unknown as HTMLIFrameElement;
  return { iframe, contentWindow, postMessage };
}

/** 以指定 source 向 window 派发一条 message 事件（jsdom 校验 source 类型，故用 defineProperty 绕过）。 */
function dispatchFrom(source: unknown, data: unknown) {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
}

describe('isRenderMessage', () => {
  it('接受字段齐全的 render 消息', () => {
    expect(
      isRenderMessage({ kind: 'complift:render', id: 'a', tsx: 'x', css: 'y' }),
    ).toBe(true);
  });

  it('拒绝 kind 不符 / 字段缺失 / 非对象', () => {
    expect(isRenderMessage({ kind: 'complift:render-result', id: 'a', tsx: '', css: '' })).toBe(false);
    expect(isRenderMessage({ kind: 'complift:render', id: 'a', tsx: 'x' })).toBe(false);
    expect(isRenderMessage(null)).toBe(false);
    expect(isRenderMessage('complift:render')).toBe(false);
  });
});

describe('isRenderResult', () => {
  it('接受最小合法 render-result（无 error/size）', () => {
    expect(isRenderResult({ kind: 'complift:render-result', id: 'a', ok: true })).toBe(true);
  });

  it('接受带 error 与 size 的 render-result', () => {
    expect(
      isRenderResult({
        kind: 'complift:render-result',
        id: 'a',
        ok: false,
        error: 'boom',
        size: { width: 10, height: 20 },
      }),
    ).toBe(true);
  });

  it('拒绝 kind 不符 / ok 非 boolean / 非对象', () => {
    expect(isRenderResult({ kind: 'complift:render', id: 'a', ok: true })).toBe(false);
    expect(isRenderResult({ kind: 'complift:render-result', id: 'a', ok: 'yes' })).toBe(false);
    expect(isRenderResult(undefined)).toBe(false);
  });
});

describe('isRenderSize', () => {
  it('接受带 size 的 render-size 消息', () => {
    expect(
      isRenderSize({
        kind: 'complift:render-size',
        id: 'a',
        size: { width: 10, height: 20 },
      }),
    ).toBe(true);
  });

  it('拒绝 kind 不符 / size 缺失或非数字 / 非对象', () => {
    expect(isRenderSize({ kind: 'complift:render-result', id: 'a', size: { width: 1, height: 2 } })).toBe(false);
    expect(isRenderSize({ kind: 'complift:render-size', id: 'a' })).toBe(false);
    expect(isRenderSize({ kind: 'complift:render-size', id: 'a', size: { width: '1', height: 2 } })).toBe(false);
    expect(isRenderSize(null)).toBe(false);
  });
});

describe('createSandboxClient', () => {
  let fake: ReturnType<typeof makeFakeIframe>;
  let client: ReturnType<typeof createSandboxClient>;

  beforeEach(() => {
    fake = makeFakeIframe();
  });

  afterEach(() => {
    client?.dispose();
  });

  it('render 往 iframe.contentWindow 投递带 id 的 render 消息', () => {
    client = createSandboxClient(fake.iframe);
    void client.render('<App/>', '.a{}');
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    const sent: unknown = fake.postMessage.mock.calls[0]?.[0];
    expect(isRenderMessage(sent)).toBe(true);
    expect(sent).toMatchObject({ kind: 'complift:render', tsx: '<App/>', css: '.a{}' });
  });

  it('按 id 关联：匹配 id 的 render-result 让 render promise resolve', async () => {
    client = createSandboxClient(fake.iframe);
    const promise = client.render('tsx', 'css');
    const sent = fake.postMessage.mock.calls[0]?.[0] as { id: string };
    dispatchFrom(fake.contentWindow, {
      kind: 'complift:render-result',
      id: sent.id,
      ok: true,
      size: { width: 100, height: 50 },
    });
    await expect(promise).resolves.toEqual({
      ok: true,
      size: { width: 100, height: 50 },
    });
  });

  it('忽略 id 不匹配的乱序旧响应，直到匹配 id 到来才 resolve', async () => {
    client = createSandboxClient(fake.iframe);
    const promise = client.render('tsx', 'css');
    const sent = fake.postMessage.mock.calls[0]?.[0] as { id: string };
    const resolved = vi.fn();
    void promise.then(resolved);

    dispatchFrom(fake.contentWindow, {
      kind: 'complift:render-result',
      id: 'stale-id',
      ok: true,
    });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    dispatchFrom(fake.contentWindow, { kind: 'complift:render-result', id: sent.id, ok: true });
    await expect(promise).resolves.toMatchObject({ ok: true });
  });

  it('忽略 source 不是 iframe.contentWindow 的消息', async () => {
    client = createSandboxClient(fake.iframe);
    const promise = client.render('tsx', 'css');
    const sent = fake.postMessage.mock.calls[0]?.[0] as { id: string };
    const resolved = vi.fn();
    void promise.then(resolved);

    dispatchFrom({ other: 'window' }, { kind: 'complift:render-result', id: sent.id, ok: true });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
  });

  it('默认 15s 超时后 resolve { ok: false, error: "timeout" }', async () => {
    vi.useFakeTimers();
    try {
      client = createSandboxClient(fake.iframe);
      const promise = client.render('tsx', 'css');
      vi.advanceTimersByTime(15_000);
      await expect(promise).resolves.toEqual({ ok: false, error: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('timeoutMs 可配置', async () => {
    vi.useFakeTimers();
    try {
      client = createSandboxClient(fake.iframe, { timeoutMs: 1_000 });
      const promise = client.render('tsx', 'css');
      vi.advanceTimersByTime(999);
      vi.advanceTimersByTime(1);
      await expect(promise).resolves.toEqual({ ok: false, error: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('连发 render：旧 pending resolve { ok: false, error: "superseded" }，新 render 正常完成', async () => {
    client = createSandboxClient(fake.iframe);
    const first = client.render('tsx-1', 'css-1');
    const second = client.render('tsx-2', 'css-2');
    await expect(first).resolves.toEqual({ ok: false, error: 'superseded' });

    const sentSecond = fake.postMessage.mock.calls[1]?.[0] as { id: string };
    dispatchFrom(fake.contentWindow, {
      kind: 'complift:render-result',
      id: sentSecond.id,
      ok: true,
    });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it('被 supersede 的旧 id 响应到达后被忽略，不影响新 pending', async () => {
    client = createSandboxClient(fake.iframe);
    void client.render('tsx-1', 'css-1');
    const sentFirst = fake.postMessage.mock.calls[0]?.[0] as { id: string };
    const second = client.render('tsx-2', 'css-2');
    const resolved = vi.fn();
    void second.then(resolved);

    dispatchFrom(fake.contentWindow, { kind: 'complift:render-result', id: sentFirst.id, ok: true });
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
  });

  it('dispose 后到达的 render-result 不再让 pending 以 ok:true resolve', async () => {
    client = createSandboxClient(fake.iframe);
    const promise = client.render('tsx', 'css');
    const sent = fake.postMessage.mock.calls[0]?.[0] as { id: string };
    client.dispose();
    dispatchFrom(fake.contentWindow, { kind: 'complift:render-result', id: sent.id, ok: true });
    const result: RenderResult = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('disposed');
  });

  it('dispose 移除监听后，后续消息不抛错也不产生副作用', () => {
    client = createSandboxClient(fake.iframe);
    client.dispose();
    expect(() =>
      dispatchFrom(fake.contentWindow, { kind: 'complift:render-result', id: 'x', ok: true }),
    ).not.toThrow();
  });

  it('onSize 订阅者收到 render-size 更新（不影响 render-result）', () => {
    client = createSandboxClient(fake.iframe);
    const sizes = vi.fn();
    client.onSize(sizes);

    dispatchFrom(fake.contentWindow, {
      kind: 'complift:render-size',
      id: 'r1',
      size: { width: 120, height: 60 },
    });

    expect(sizes).toHaveBeenCalledTimes(1);
    expect(sizes).toHaveBeenCalledWith('r1', { width: 120, height: 60 });
  });

  it('onSize 返回的 unsubscribe 生效后不再收到更新', () => {
    client = createSandboxClient(fake.iframe);
    const sizes = vi.fn();
    const unsubscribe = client.onSize(sizes);

    unsubscribe();
    dispatchFrom(fake.contentWindow, {
      kind: 'complift:render-size',
      id: 'r1',
      size: { width: 10, height: 10 },
    });

    expect(sizes).not.toHaveBeenCalled();
  });

  it('忽略 source 不是 iframe.contentWindow 的 render-size', () => {
    client = createSandboxClient(fake.iframe);
    const sizes = vi.fn();
    client.onSize(sizes);

    dispatchFrom({ other: 'window' }, {
      kind: 'complift:render-size',
      id: 'r1',
      size: { width: 10, height: 10 },
    });

    expect(sizes).not.toHaveBeenCalled();
  });
});

describe('whenIframeReady', () => {
  /**
   * 构造一个最小的 iframe 替身：可配置 contentDocument（取值器可抛错以模拟跨域
   * SecurityError），并带 add/removeEventListener 的 spy + 手动触发 load 的入口。
   */
  function makeReadyFake(
    opts: {
      /** 'doc' → 可达且 complete；'loading' → 可达但未 complete；'null' → null；'throws' → 取值抛错 */
      doc: 'doc' | 'loading' | 'null' | 'throws';
    },
  ) {
    let loadListener: (() => void) | null = null;
    let loadOnce = false;
    const addEventListener = vi.fn(
      (type: string, cb: () => void, opts?: { once?: boolean }) => {
        if (type === 'load') {
          loadListener = cb;
          loadOnce = opts?.once === true;
        }
      },
    );
    const removeEventListener = vi.fn((type: string, cb: () => void) => {
      if (type === 'load' && loadListener === cb) loadListener = null;
    });
    const base = {
      addEventListener,
      removeEventListener,
    };
    const iframe = base as unknown as HTMLIFrameElement & Record<string, unknown>;
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get() {
        switch (opts.doc) {
          case 'throws':
            throw new DOMException('cross-origin', 'SecurityError');
          case 'null':
            return null;
          case 'loading':
            return { readyState: 'loading' };
          case 'doc':
            return { readyState: 'complete' };
        }
      },
    });
    return {
      iframe,
      addEventListener,
      removeEventListener,
      /** 触发已注册的 load 监听（若仍挂着）；模拟 DOM 的 { once:true } 自动卸载。 */
      fireLoad: () => {
        const cb = loadListener;
        if (cb === null) return;
        if (loadOnce) loadListener = null;
        cb();
      },
    };
  }

  // 设计取舍说明：whenIframeReady 不能只等待一次性 load。MV3 sandbox 去掉
  // allow-same-origin 后是 opaque iframe，React effect 注册监听时 load 可能已经发生；
  // 如果此时不立即尝试 render，Stage/Standalone 会永久留白。所有分支都会立即尝试一次，
  // 并为真实 src 导航完成保留一次 load 补渲染；早先那次会被 sandbox client 顶掉。

  it('contentDocument 可达且 readyState=complete：cb 同步执行；cleanup 安全且不重复触发', () => {
    const fakeFrame = makeReadyFake({ doc: 'doc' });
    const cb = vi.fn();
    const cleanup = whenIframeReady(fakeFrame.iframe, cb);

    // 可达 → 立即同步渲染
    expect(cb).toHaveBeenCalledTimes(1);
    // cleanup 调用安全；它只是摘掉补渲染的 load 监听，不会再次触发 cb
    expect(() => cleanup()).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1);
    // cleanup 后即便真实导航完成也不再补渲染
    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('contentDocument 取值抛错（跨域 SecurityError）：先同步尝试，load 后补渲染一次', () => {
    const fakeFrame = makeReadyFake({ doc: 'throws' });
    const cb = vi.fn();
    whenIframeReady(fakeFrame.iframe, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(fakeFrame.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });

    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(2);

    // 一次性：再次触发不应重复调用
    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('contentDocument === null（尚未导航）：先同步尝试，load 后补渲染一次', () => {
    const fakeFrame = makeReadyFake({ doc: 'null' });
    const cb = vi.fn();
    whenIframeReady(fakeFrame.iframe, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(fakeFrame.addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });
    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('contentDocument 可达但 readyState 非 complete：同步渲染（不死锁），并在 load 后补渲染一次', () => {
    const fakeFrame = makeReadyFake({ doc: 'loading' });
    const cb = vi.fn();
    whenIframeReady(fakeFrame.iframe, cb);

    // 可达即同步渲染，避免 jsdom 永不触发 load 导致死锁
    expect(cb).toHaveBeenCalledTimes(1);
    // 真实 src 导航完成后用最终文档再渲染一次
    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('cleanup 在 load 前调用（跨域分支）：移除补渲染监听，只保留同步尝试', () => {
    const fakeFrame = makeReadyFake({ doc: 'throws' });
    const cb = vi.fn();
    const cleanup = whenIframeReady(fakeFrame.iframe, cb);

    expect(cb).toHaveBeenCalledTimes(1);
    cleanup();
    expect(fakeFrame.removeEventListener).toHaveBeenCalledWith('load', expect.any(Function));

    // cleanup 后即使触发 load 也不再调用 cb
    fakeFrame.fireLoad();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
