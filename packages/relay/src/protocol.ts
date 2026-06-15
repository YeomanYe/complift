/**
 * Wire protocol shared between the relay (ws server) and the extension
 * background (ws client). Source of truth for the RPC method names lives in
 * `packages/extension/src/lib/messages.ts` (`RpcMethod` / `RpcMap`). We mirror a
 * minimal local union here instead of importing across packages because the
 * extension package is a WXT app with no public type entry, and a node-only
 * relay should not pull WXT/DOM types into its compilation. Keep this list in
 * sync with `RPC_METHODS` in the extension.
 */
export type RpcMethod =
  | 'component:list'
  | 'component:get'
  | 'component:history'
  | 'component:update'
  | 'component:rollback'
  | 'component:delete'
  | 'capture:create'
  | 'picker:start'
  | 'picker:cancel'
  | 'overlay:show'
  | 'overlay:hide'
  | 'relay:status';

/** background → relay: registration handshake on connect. */
export interface ExtHello {
  kind: 'ext:hello';
  version: number;
}

/** relay → background: forward an MCP tool call (id-correlated). */
export interface RelayRpc {
  kind: 'relay:rpc';
  id: string;
  method: RpcMethod;
  params: unknown;
}

/** background → relay: result for a previously forwarded `relay:rpc`. */
export interface ExtRpcResult {
  kind: 'ext:rpc-result';
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type RelayToExt = RelayRpc;
export type ExtToRelay = ExtHello | ExtRpcResult;

export const isExtHello = (m: unknown): m is ExtHello => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'ext:hello' && typeof msg.version === 'number';
};

export const isExtRpcResult = (m: unknown): m is ExtRpcResult => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return (
    msg.kind === 'ext:rpc-result' &&
    typeof msg.id === 'string' &&
    typeof msg.ok === 'boolean'
  );
};
