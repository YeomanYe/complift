import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { generate } from '../lib/generate/generator';
import { createComponentStore } from '../lib/store/component-store';
import type {
  BroadcastEvent,
  RpcMap,
  RpcMethod,
  RpcRequest,
} from '../lib/messages';
import type { CaptureIR } from '../lib/types';
import {
  createRouter,
  isOverlayHideMessage,
  isOverlayShowMessage,
  type RouterDeps,
} from './router';

const meta = {
  name: 'PricingCard',
  sourceUrl: 'https://example.com/pricing',
  sourceSelector: 'main > div.card',
  width: 320,
  height: 480,
};
const files = { tsx: 'export const A = () => null;', css: '.a{}' };

const ir: CaptureIR = {
  root: {
    tag: 'div',
    attrs: { 'data-original-class': 'pricing card' },
    styles: { color: 'rgb(10, 20, 30)' },
    children: [{ text: 'Hello' }],
  },
  baseUrl: 'https://example.com/',
  pageTitle: 'Example Pricing',
  viewport: { width: 1280, height: 800 },
  rect: { width: 321, height: 201 },
};

let dbCounter = 0;
function harness() {
  dbCounter += 1;
  const store = createComponentStore(`complift-router-${Date.now()}-${dbCounter}`);
  const deps: RouterDeps = {
    store,
    generate,
    injectPicker: vi.fn(async () => {}),
    injectOverlay: vi.fn(async () => {}),
    hideOverlay: vi.fn(async () => {}),
    relayStatus: vi.fn(() => false),
    broadcast: vi.fn<(e: BroadcastEvent) => void>(),
  };
  return { store, deps, router: createRouter(deps) };
}

function req<M extends RpcMethod>(
  method: M,
  params: RpcMap[M]['req'],
  id = `id-${method}`,
): RpcRequest<M> {
  return { kind: 'complift:rpc', id, method, params };
}

describe('createRouter', () => {
  it('component:list 返回 store 中全部组件', async () => {
    const { store, router } = harness();
    const { component } = await store.createFromCapture(meta, files);

    const res = await router.handle(req('component:list', {}, 'list-1'));

    expect(res).toMatchObject({ kind: 'complift:rpc-result', id: 'list-1', ok: true });
    expect((res.data as { id: string }[]).map((c) => c.id)).toEqual([component.id]);
  });

  it('component:get 缺省 versionId 时返回 head 版本', async () => {
    const { store, router } = harness();
    const { component } = await store.createFromCapture(meta, files);
    const v2 = await store.addVersion(component.id, files, 'manual', 'v2');

    const res = await router.handle(req('component:get', { componentId: component.id }));

    expect(res.ok).toBe(true);
    const data = res.data as RpcMap['component:get']['res'];
    expect(data.component.id).toBe(component.id);
    expect(data.version.id).toBe(v2.id);
  });

  it('component:get 指定 versionId 时返回该版本', async () => {
    const { store, router } = harness();
    const { component, version: v1 } = await store.createFromCapture(meta, files);
    await store.addVersion(component.id, files, 'manual', 'v2');

    const res = await router.handle(
      req('component:get', { componentId: component.id, versionId: v1.id }),
    );

    expect(res.ok).toBe(true);
    expect((res.data as RpcMap['component:get']['res']).version.id).toBe(v1.id);
  });

  it('component:history 按 seq 升序返回版本列表', async () => {
    const { store, router } = harness();
    const { component } = await store.createFromCapture(meta, files);
    await store.addVersion(component.id, files, 'manual', 'v2');

    const res = await router.handle(req('component:history', { componentId: component.id }));

    expect(res.ok).toBe(true);
    expect((res.data as { seq: number }[]).map((v) => v.seq)).toEqual([1, 2]);
  });

  it('component:update 新增版本并广播 component:changed', async () => {
    const { store, deps, router } = harness();
    const { component } = await store.createFromCapture(meta, files);

    const res = await router.handle(
      req('component:update', {
        componentId: component.id,
        tsx: 'export const B = () => null;',
        css: '.b{}',
        author: 'agent',
        message: 'agent edit',
      }),
    );

    expect(res.ok).toBe(true);
    const version = res.data as RpcMap['component:update']['res'];
    expect(version.seq).toBe(2);
    expect(version.author).toBe('agent');
    expect(deps.broadcast).toHaveBeenCalledWith({
      kind: 'complift:event',
      type: 'component:changed',
      componentId: component.id,
    });
  });

  it('component:rollback 产生 rollback 版本并广播 component:changed', async () => {
    const { store, deps, router } = harness();
    const { component, version: v1 } = await store.createFromCapture(meta, files);
    await store.addVersion(component.id, { tsx: 'x', css: 'y' }, 'manual', 'v2');

    const res = await router.handle(
      req('component:rollback', { componentId: component.id, versionId: v1.id }),
    );

    expect(res.ok).toBe(true);
    const version = res.data as RpcMap['component:rollback']['res'];
    expect(version.author).toBe('rollback');
    expect(version.files).toEqual(v1.files);
    expect(deps.broadcast).toHaveBeenCalledWith({
      kind: 'complift:event',
      type: 'component:changed',
      componentId: component.id,
    });
  });

  it('component:delete 删除组件后 list 不再包含它', async () => {
    const { store, router } = harness();
    const { component } = await store.createFromCapture(meta, files);

    const res = await router.handle(req('component:delete', { componentId: component.id }));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(await store.list()).toEqual([]);
  });

  it('capture:create 走真 generate 入库并广播 created + picked', async () => {
    const { store, deps, router } = harness();

    const res = await router.handle(
      req('capture:create', {
        ir,
        sourceUrl: 'https://example.com/pricing',
        sourceSelector: 'main > section.pricing',
      }),
    );

    expect(res.ok).toBe(true);
    const data = res.data as RpcMap['capture:create']['res'];
    const expected = generate(ir);
    expect(data.component.name).toBe(expected.componentName);
    expect(data.component.sourceUrl).toBe('https://example.com/pricing');
    expect(data.component.sourceSelector).toBe('main > section.pricing');
    expect(data.component.width).toBe(ir.rect.width);
    expect(data.component.height).toBe(ir.rect.height);
    expect(data.version.files).toEqual({ tsx: expected.tsx, css: expected.css });
    expect(await store.get(data.component.id)).toEqual(data.component);
    expect(deps.broadcast).toHaveBeenCalledWith({
      kind: 'complift:event',
      type: 'component:created',
      componentId: data.component.id,
    });
    expect(deps.broadcast).toHaveBeenCalledWith({
      kind: 'complift:event',
      type: 'picker:picked',
      componentId: data.component.id,
    });
  });

  it('picker:start 把 tabId 透传给 injectPicker', async () => {
    const { deps, router } = harness();

    const res = await router.handle(req('picker:start', { tabId: 42 }));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(deps.injectPicker).toHaveBeenCalledWith(42);
  });

  it('picker:cancel 返回 ok', async () => {
    const { router } = harness();

    const res = await router.handle(req('picker:cancel', {}));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
  });

  it('overlay:show 用 head 版本文件与 sourceSelector 调 injectOverlay', async () => {
    const { store, deps, router } = harness();
    const { component } = await store.createFromCapture(meta, files);
    const v2 = await store.addVersion(component.id, { tsx: 'n', css: 'm' }, 'manual', 'v2');

    const res = await router.handle(
      req('overlay:show', { componentId: component.id, opacity: 0.5, mode: 'difference' }),
    );

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(deps.injectOverlay).toHaveBeenCalledWith(undefined, {
      componentId: component.id,
      opacity: 0.5,
      mode: 'difference',
      files: v2.files,
      sourceSelector: meta.sourceSelector,
    });
  });

  it('overlay:hide 调 hideOverlay', async () => {
    const { deps, router } = harness();

    const res = await router.handle(req('overlay:hide', {}));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ ok: true });
    expect(deps.hideOverlay).toHaveBeenCalledWith(undefined);
  });

  it('overlay 线协议 guards 识别 show/hide 消息', () => {
    const validPayload = {
      componentId: 'c1',
      opacity: 0.5,
      mode: 'overlay' as const,
      files: { tsx: 'export const A = () => null;', css: '.a{}' },
      sourceSelector: 'main > div',
    };
    // 完整合法消息通过
    expect(
      isOverlayShowMessage({
        kind: 'complift:overlay-show',
        sandboxUrl: '/sandbox.html',
        payload: validPayload,
      }),
    ).toBe(true);

    // 深校验:payload 内部承载字段缺失/错型一律拒绝(不能只靠 payload 是对象)
    expect(
      isOverlayShowMessage({
        kind: 'complift:overlay-show',
        sandboxUrl: '/sandbox.html',
        payload: { componentId: 'c1' }, // 缺 files/opacity/mode/sourceSelector
      }),
    ).toBe(false);
    expect(
      isOverlayShowMessage({
        kind: 'complift:overlay-show',
        sandboxUrl: '/sandbox.html',
        payload: { ...validPayload, files: { tsx: 'x' } }, // 缺 css
      }),
    ).toBe(false);
    expect(
      isOverlayShowMessage({
        kind: 'complift:overlay-show',
        sandboxUrl: '/sandbox.html',
        payload: { ...validPayload, mode: 'bogus' }, // mode 非法枚举值
      }),
    ).toBe(false);
    expect(
      isOverlayShowMessage({
        kind: 'complift:overlay-show',
        sandboxUrl: '/sandbox.html',
        payload: { ...validPayload, opacity: '0.5' }, // opacity 错型
      }),
    ).toBe(false);
    expect(isOverlayShowMessage({ kind: 'complift:overlay-show' })).toBe(false);
    expect(isOverlayShowMessage({ kind: 'other' })).toBe(false);

    expect(isOverlayHideMessage({ kind: 'complift:overlay-hide' })).toBe(true);
    expect(isOverlayHideMessage({ kind: 'complift:overlay-show' })).toBe(false);
    expect(isOverlayHideMessage(null)).toBe(false);
  });

  it('relay:status 透传 relayStatus 返回值', async () => {
    const { deps, router } = harness();
    (deps.relayStatus as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await router.handle(req('relay:status', {}));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ connected: true });
  });

  it('未知 method 返回 ok:false unknown-method', async () => {
    const { router } = harness();
    const bogus = {
      kind: 'complift:rpc',
      id: 'bogus-1',
      method: 'nope:nope',
      params: {},
    } as unknown as RpcRequest;

    const res = await router.handle(bogus);

    expect(res).toEqual({
      kind: 'complift:rpc-result',
      id: 'bogus-1',
      ok: false,
      error: 'unknown-method',
    });
  });

  it('handler 抛异常被包成 ok:false 不逃逸', async () => {
    const { router } = harness();

    const res = await router.handle(
      req('component:get', { componentId: 'missing-id' }, 'err-1'),
    );

    expect(res.kind).toBe('complift:rpc-result');
    expect(res.id).toBe('err-1');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('missing-id');
  });
});
