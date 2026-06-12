import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { BroadcastEvent } from '../lib/messages';
import { createMockAdapter } from './mock-adapter';

describe('createMockAdapter', () => {
  it('默认 fixtures 含 ≥3 个名称与来源互异的组件', async () => {
    const adapter = createMockAdapter();

    const components = await adapter.rpc('component:list', {});

    expect(components.length).toBeGreaterThanOrEqual(3);
    expect(new Set(components.map((c) => c.name)).size).toBe(components.length);
    expect(new Set(components.map((c) => c.sourceUrl)).size).toBe(components.length);
  });

  it('fixtures 版本数有差异:有 0 额外版本的,也有 ≥3 额外版本且 agent/manual 混合的', async () => {
    const adapter = createMockAdapter();

    const components = await adapter.rpc('component:list', {});
    const histories = await Promise.all(
      components.map((c) => adapter.rpc('component:history', { componentId: c.id })),
    );

    const counts = histories.map((h) => h.length);
    expect(counts).toContain(1);
    const rich = histories.find((h) => h.length >= 4);
    expect(rich).toBeDefined();
    const authors = new Set(rich!.map((v) => v.author));
    expect(authors.has('agent')).toBe(true);
    expect(authors.has('manual')).toBe(true);
  });

  it('fixtures 的 head 版本文件是合法 generate 产物形态(含组件导出与 css 引用)', async () => {
    const adapter = createMockAdapter();

    const [component] = await adapter.rpc('component:list', {});
    const { version } = await adapter.rpc('component:get', { componentId: component!.id });

    expect(version.files.tsx).toContain(`export function`);
    expect(version.files.tsx).toContain(`import './`);
  });

  it('rpc 走完整 router:update 后 onEvent 收到 component:changed', async () => {
    const adapter = createMockAdapter();
    const events: BroadcastEvent[] = [];
    const unsubscribe = adapter.onEvent((e) => events.push(e));

    const [component] = await adapter.rpc('component:list', {});
    await adapter.rpc('component:update', {
      componentId: component!.id,
      tsx: 'export const X = () => null;',
      css: '.x{}',
      author: 'manual',
      message: 'edit',
    });

    expect(events).toContainEqual({
      kind: 'complift:event',
      type: 'component:changed',
      componentId: component!.id,
    });
    unsubscribe();
  });

  it('unsubscribe 后不再收到广播', async () => {
    const adapter = createMockAdapter();
    const events: BroadcastEvent[] = [];
    const unsubscribe = adapter.onEvent((e) => events.push(e));
    unsubscribe();

    const [component] = await adapter.rpc('component:list', {});
    await adapter.rpc('component:update', {
      componentId: component!.id,
      tsx: 'export const X = () => null;',
      css: '.x{}',
      author: 'agent',
      message: 'edit',
    });

    expect(events).toEqual([]);
  });

  it('router 返回 ok:false 时 rpc 抛错', async () => {
    const adapter = createMockAdapter();

    await expect(
      adapter.rpc('component:get', { componentId: 'does-not-exist' }),
    ).rejects.toThrow(/does-not-exist/);
  });

  it('sandboxUrl 返回 mock 沙箱页路径', () => {
    const adapter = createMockAdapter();

    expect(adapter.sandboxUrl()).toBe('/sandbox-mock.html');
  });
});
