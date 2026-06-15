import type { CaptureIR, ClonedComponent, ComponentVersion } from './types';

export interface RpcMap {
  'component:list':     { req: {}; res: ClonedComponent[] };
  'component:get':      { req: { componentId: string; versionId?: string };
                          res: { component: ClonedComponent; version: ComponentVersion } };
  'component:history':  { req: { componentId: string }; res: ComponentVersion[] };
  'component:update':   { req: { componentId: string; tsx: string; css: string;
                                 author: 'manual' | 'agent'; message: string };
                          res: ComponentVersion };
  'component:rollback': { req: { componentId: string; versionId: string }; res: ComponentVersion };
  'component:delete':   { req: { componentId: string }; res: { ok: true } };
  'capture:create':     { req: { ir: CaptureIR; sourceUrl: string; sourceSelector: string };
                          res: { component: ClonedComponent; version: ComponentVersion } };
  'picker:start':       { req: { tabId?: number }; res: { ok: true } };
  'picker:cancel':      { req: {}; res: { ok: true } };
  'overlay:show':       { req: { componentId: string; opacity: number;
                                 mode: 'overlay' | 'difference' }; res: { ok: true } };
  'overlay:hide':       { req: {}; res: { ok: true } };
  'relay:status':       { req: {}; res: { connected: boolean } };
}
export type RpcMethod = keyof RpcMap;
// SOURCE OF TRUTH for RPC method names. The relay mirrors this list in
// `packages/relay/src/protocol.ts` (`RELAY_RPC_METHODS`); `protocol.test.ts`
// asserts the two are set-equal. If you add/remove a method here, update the
// relay's list too or that test fails.
export const RPC_METHODS = [
  'component:list',
  'component:get',
  'component:history',
  'component:update',
  'component:rollback',
  'component:delete',
  'capture:create',
  'picker:start',
  'picker:cancel',
  'overlay:show',
  'overlay:hide',
  'relay:status',
] as const satisfies readonly RpcMethod[];
export interface RpcRequest<M extends RpcMethod = RpcMethod> {
  kind: 'complift:rpc'; id: string; method: M; params: RpcMap[M]['req'];
}
export interface RpcResponse<M extends RpcMethod = RpcMethod> {
  kind: 'complift:rpc-result'; id: string; ok: boolean;
  data?: RpcMap[M]['res']; error?: string;
}
export type BroadcastEvent =
  | { kind: 'complift:event'; type: 'component:changed'; componentId: string }
  | { kind: 'complift:event'; type: 'component:created'; componentId: string }
  | { kind: 'complift:event'; type: 'relay:status'; connected: boolean }
  | { kind: 'complift:event'; type: 'picker:picked'; componentId: string };
export const isRpcRequest = (m: unknown): m is RpcRequest => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'complift:rpc'
    && typeof msg.id === 'string'
    && typeof msg.method === 'string'
    && (RPC_METHODS as readonly string[]).includes(msg.method)
    && typeof msg.params === 'object' && msg.params !== null;
};
export const isBroadcast = (m: unknown): m is BroadcastEvent => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'complift:event' && typeof msg.type === 'string';
};
