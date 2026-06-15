import { browser } from 'wxt/browser';
import {
  isBroadcast,
  type RpcMap,
  type RpcMethod,
  type RpcRequest,
  type RpcResponse,
} from '../lib/messages';
import type { PlatformAdapter } from './adapter';

const RPC_TIMEOUT_MS = 15_000;

/** 真实扩展环境的 PlatformAdapter:经 browser.runtime 消息通道与 background 通信。 */
export function createChromeAdapter(): PlatformAdapter {
  return {
    rpc<M extends RpcMethod>(method: M, params: RpcMap[M]['req']): Promise<RpcMap[M]['res']> {
      const request: RpcRequest<M> = {
        kind: 'complift:rpc',
        id: crypto.randomUUID(),
        method,
        params,
      };
      return new Promise<RpcMap[M]['res']>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`rpc timeout after ${RPC_TIMEOUT_MS}ms: ${method}`));
        }, RPC_TIMEOUT_MS);
        browser.runtime.sendMessage(request).then(
          (raw: unknown) => {
            clearTimeout(timer);
            const response = raw as RpcResponse<M> | undefined;
            if (response === undefined || response.kind !== 'complift:rpc-result') {
              reject(new Error(`rpc got no response: ${method}`));
              return;
            }
            if (!response.ok) {
              reject(new Error(response.error ?? `rpc failed: ${method}`));
              return;
            }
            resolve(response.data as RpcMap[M]['res']);
          },
          (err: unknown) => {
            clearTimeout(timer);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
      });
    },

    onEvent(cb) {
      const listener = (message: unknown): void => {
        if (isBroadcast(message)) cb(message);
      };
      browser.runtime.onMessage.addListener(listener);
      return () => browser.runtime.onMessage.removeListener(listener);
    },

    sandboxUrl() {
      return browser.runtime.getURL('/sandbox.html');
    },

    async openStandalone(componentId) {
      const url = browser.runtime.getURL(
        `/standalone.html?componentId=${encodeURIComponent(componentId)}`,
      );
      await browser.windows.create({ url, type: 'popup', width: 1024, height: 768 });
    },
  };
}
