import { browser } from 'wxt/browser';
import { createRouter, type OverlayPayload } from '../src/background/router';
import { generate } from '../src/lib/generate/generator';
import { isRpcRequest, type BroadcastEvent } from '../src/lib/messages';
import { createComponentStore } from '../src/lib/store/component-store';

async function targetTabId(tabId: number | undefined): Promise<number> {
  if (tabId !== undefined) return tabId;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab to inject into');
  return tab.id;
}

export default defineBackground(() => {
  const store = createComponentStore();

  const broadcast = (e: BroadcastEvent): void => {
    // 广播尽力而为:side panel / 预览窗未开时无监听者,不视为错误
    void browser.runtime.sendMessage(e).catch(() => {});
  };

  const router = createRouter({
    store,
    generate,

    async injectPicker(tabId) {
      const target = await targetTabId(tabId);
      await browser.scripting.executeScript({
        target: { tabId: target },
        files: ['/content-scripts/picker.js'],
      });
    },

    async injectOverlay(tabId, payload: OverlayPayload) {
      const target = await targetTabId(tabId);
      await browser.scripting.executeScript({
        target: { tabId: target },
        files: ['/content-scripts/overlay.js'],
      });
      try {
        await browser.tabs.sendMessage(target, {
          kind: 'complift:overlay-show',
          payload,
          sandboxUrl: browser.runtime.getURL('/sandbox.html'),
        });
      } catch {
        // overlay content script 未就绪时容错(executeScript 与 sendMessage 之间的竞态)
      }
    },

    async hideOverlay(tabId) {
      try {
        const target = await targetTabId(tabId);
        await browser.tabs.sendMessage(target, { kind: 'complift:overlay-hide' });
      } catch {
        // 页面上没有 overlay 时无需处理
      }
    },

    // Task 11 接 relay 真值
    relayStatus: () => false,

    broadcast,
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRpcRequest(message)) return;
    void router.handle(message).then(sendResponse);
    return true; // 异步回包
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab.windowId === undefined) return;
    void browser.sidePanel.open({ windowId: tab.windowId });
  });
});
