import { describe, expect, it } from 'vitest';
import type { ClonedComponent, ComponentVersion } from './types';
import { isBroadcast, isRpcRequest } from './messages';
import type { BroadcastEvent, RpcMap, RpcRequest } from './messages';

describe('isRpcRequest', () => {
  it('接受字段齐全的合法 rpc 请求', () => {
    const msg = {
      kind: 'complift:rpc',
      id: 'req-1',
      method: 'component:list',
      params: {},
    };
    expect(isRpcRequest(msg)).toBe(true);
  });

  it('拒绝缺少 kind 的消息', () => {
    expect(
      isRpcRequest({ id: 'req-1', method: 'component:list', params: {} }),
    ).toBe(false);
  });

  it('拒绝 kind 不是 complift:rpc 的消息', () => {
    expect(
      isRpcRequest({
        kind: 'complift:event',
        id: 'req-1',
        method: 'component:list',
        params: {},
      }),
    ).toBe(false);
  });

  it('拒绝 null', () => {
    expect(isRpcRequest(null)).toBe(false);
  });

  it('拒绝非对象的原始值', () => {
    expect(isRpcRequest('complift:rpc')).toBe(false);
  });

  it('拒绝 method 不是 string 的消息', () => {
    expect(
      isRpcRequest({ kind: 'complift:rpc', id: 'req-1', method: 42, params: {} }),
    ).toBe(false);
  });

  it('拒绝 id 不是 string 的消息', () => {
    expect(
      isRpcRequest({
        kind: 'complift:rpc',
        id: 7,
        method: 'component:list',
        params: {},
      }),
    ).toBe(false);
  });

  it('拒绝缺少 params 的消息', () => {
    expect(
      isRpcRequest({ kind: 'complift:rpc', id: 'req-1', method: 'component:list' }),
    ).toBe(false);
  });
});

describe('isBroadcast', () => {
  it('接受 component:changed 事件', () => {
    expect(
      isBroadcast({
        kind: 'complift:event',
        type: 'component:changed',
        componentId: 'c1',
      }),
    ).toBe(true);
  });

  it('接受 component:created 事件', () => {
    expect(
      isBroadcast({
        kind: 'complift:event',
        type: 'component:created',
        componentId: 'c1',
      }),
    ).toBe(true);
  });

  it('接受 relay:status 事件', () => {
    expect(
      isBroadcast({ kind: 'complift:event', type: 'relay:status', connected: true }),
    ).toBe(true);
  });

  it('接受 picker:picked 事件', () => {
    expect(
      isBroadcast({
        kind: 'complift:event',
        type: 'picker:picked',
        componentId: 'c1',
      }),
    ).toBe(true);
  });

  it('拒绝异类 kind', () => {
    expect(
      isBroadcast({ kind: 'complift:rpc', type: 'component:changed' }),
    ).toBe(false);
  });

  it('拒绝 null 与缺 type 的消息', () => {
    expect(isBroadcast(null)).toBe(false);
    expect(isBroadcast({ kind: 'complift:event' })).toBe(false);
  });
});

describe('契约类型层冒烟', () => {
  it('RpcMap 的 capture:create entry 形状能被合法实参满足（编译期保障）', () => {
    const component = {
      id: 'c1',
      name: 'HeroCard',
      sourceUrl: 'https://example.com',
      sourceSelector: 'main > div',
      capturedAt: 1718180000000,
      width: 320,
      height: 200,
      headVersionId: 'v1',
    } satisfies ClonedComponent;

    const version = {
      id: 'v1',
      componentId: 'c1',
      seq: 1,
      parentId: null,
      author: 'capture',
      message: 'initial capture',
      createdAt: 1718180000000,
      files: { tsx: 'export const HeroCard = () => null;', css: '' },
    } satisfies ComponentVersion;

    const captureCreate = {
      req: {
        ir: {
          root: { tag: 'div', attrs: {}, styles: {}, children: [{ text: 'hi' }] },
          baseUrl: 'https://example.com',
          pageTitle: 'Example',
          viewport: { width: 1280, height: 800 },
          rect: { width: 320, height: 200 },
        },
        sourceUrl: 'https://example.com',
        sourceSelector: 'main > div',
      },
      res: { component, version },
    } satisfies RpcMap['capture:create'];

    const request = {
      kind: 'complift:rpc',
      id: 'req-1',
      method: 'capture:create',
      params: captureCreate.req,
    } satisfies RpcRequest<'capture:create'>;

    const event = {
      kind: 'complift:event',
      type: 'picker:picked',
      componentId: component.id,
    } satisfies BroadcastEvent;

    expect(request.method).toBe('capture:create');
    expect(event.type).toBe('picker:picked');
  });
});
