import { browser } from 'wxt/browser';
import { createRouter, type OverlayPayload } from '../src/background/router';
import { startRelayClient } from '../src/background/relay-client';
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

  // relay 连接状态:由 relay-client 维护,relay:status RPC 与 StatusBar 读取此值
  let relayConnected = false;

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

    relayStatus: () => relayConnected,

    broadcast,
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRpcRequest(message)) return;
    void router.handle(message).then(sendResponse);
    return true; // 异步回包
  });

  // 主动外拨本地 relay(ws 客户端);连接状态变化广播给 StatusBar(Task 9)
  startRelayClient({
    router,
    onStatusChange(connected) {
      relayConnected = connected;
      broadcast({ kind: 'complift:event', type: 'relay:status', connected });
    },
  });

  browser.action.onClicked.addListener((tab) => {
    if (tab.windowId === undefined) return;
    void browser.sidePanel.open({ windowId: tab.windowId });
  });
});
