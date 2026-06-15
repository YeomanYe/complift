/**
 * Wire protocol shared between the relay (ws server) and the extension
 * background (ws client). Source of truth for the RPC method names lives in
 * `packages/extension/src/lib/messages.ts` (`RpcMethod` / `RpcMap` /
 * `RPC_METHODS`). We mirror a minimal local list here instead of importing
 * across packages at build time because the extension package is a WXT app with
 * no public type entry, and a node-only relay should not pull WXT/DOM types into
 * its compilation.
 *
 * Drift is NOT silently allowed: `protocol.test.ts` imports the extension's real
 * `RPC_METHODS` and asserts it is set-equal to {@link RELAY_RPC_METHODS} below,
 * so adding a method on the extension side without updating this list fails CI.
 * If you edit this list, update `RPC_METHODS` in the extension too (and vice
 * versa).
 */
export const RELAY_RPC_METHODS = [
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
] as const;

export type RpcMethod = (typeof RELAY_RPC_METHODS)[number];

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
