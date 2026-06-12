import type { BroadcastEvent, RpcMap, RpcMethod } from '../lib/messages';

/**
 * 平台边界接口:组件 / hooks / 业务逻辑只依赖它(ARC-5)。
 * 真实环境注入 ChromeAdapter,preview/测试注入 MockAdapter。
 */
export interface PlatformAdapter {
  rpc<M extends RpcMethod>(method: M, params: RpcMap[M]['req']): Promise<RpcMap[M]['res']>;
  onEvent(cb: (e: BroadcastEvent) => void): () => void;
  sandboxUrl(): string;
}
