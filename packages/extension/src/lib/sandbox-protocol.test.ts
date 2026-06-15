import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSandboxClient,
  isRenderMessage,
  isRenderResult,
  isRenderSize,
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
