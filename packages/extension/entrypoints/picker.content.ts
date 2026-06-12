/**
 * 选取层 content script：background executeScript 注入即启动 picker。
 * UI 逻辑在 src/picker/picker-ui.ts（可测）；这里只做引导 + RPC 收发。
 * 注：content script 不走 PlatformAdapter（那是 sidepanel 面向的边界），
 * 直接用 wxt 的 browser.runtime.sendMessage（ARC 规则允许 entrypoint 引导代码）。
 */
import { browser } from 'wxt/browser';
import type { RpcRequest, RpcResponse } from '../src/lib/messages';
import { extractElement } from '../src/lib/extract/extractor';
import { showToast, startPicker } from '../src/picker/picker-ui';
import { computeSourceSelector } from '../src/picker/source-selector';

declare global {
  interface Window {
    __compliftPickerActive?: boolean;
  }
}

async function capture(el: Element): Promise<void> {
  try {
    const ir = extractElement(el);
    const req: RpcRequest<'capture:create'> = {
      kind: 'complift:rpc',
      id: crypto.randomUUID(),
      method: 'capture:create',
      params: { ir, sourceUrl: location.href, sourceSelector: computeSourceSelector(el) },
    };
    // sendMessage 回包类型由 background router 保证，runtime 层只能拿到 unknown
    const res = (await browser.runtime.sendMessage(req)) as RpcResponse<'capture:create'>;
    if (res.ok) {
      showToast(document, '✓ Cloned · 打开 complift 面板查看');
    } else {
      showToast(document, `✕ Clone 失败：${res.error ?? '未知错误'}`, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showToast(document, `✕ Clone 失败：${message}`, true);
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    // 幂等：重复 executeScript 注入时已有 picker 在跑则直接返回
    if (window.__compliftPickerActive === true) return;
    window.__compliftPickerActive = true;
    const finish = (): void => {
      window.__compliftPickerActive = false;
    };

    startPicker(document, {
      onPick(el) {
        finish();
        void capture(el);
      },
      onCancel: finish,
    });
  },
});
