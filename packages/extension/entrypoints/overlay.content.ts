/**
 * 覆盖对比层 content script:background executeScript 注入即就绪,
 * 监听 background 的 overlay-show / overlay-hide 消息驱动页面上的对比层。
 *
 * UI 逻辑在 src/overlay/overlay-ui.ts(纯 DOM、可测);这里只做引导 + 消息收发,
 * 并把 sandbox iframe 接到 sandbox-protocol 客户端,用组件当前版本 {tsx,css} 渲染。
 * 注:content script 不走 PlatformAdapter,直接用 wxt 的 browser.runtime(ARC 允许引导代码)。
 */
import { browser } from 'wxt/browser';
import {
  isOverlayHideMessage,
  isOverlayShowMessage,
  type OverlayShowMessage,
} from '../src/background/router';
import { createSandboxClient, type SandboxClient } from '../src/lib/sandbox-protocol';
import { hideOverlay, showOverlay, type OverlayHandle } from '../src/overlay/overlay-ui';

declare global {
  interface Window {
    __compliftOverlayActive?: boolean;
  }
}

let handle: OverlayHandle | null = null;
let client: SandboxClient | null = null;

function teardown(): void {
  client?.dispose();
  client = null;
  if (handle !== null) {
    handle.hideOverlay();
    handle = null;
  } else {
    hideOverlay(document);
  }
}

function show(msg: OverlayShowMessage): void {
  teardown();
  const { payload, sandboxUrl } = msg;
  try {
    handle = showOverlay(document, {
      selector: payload.sourceSelector,
      sandboxUrl,
      opacity: payload.opacity,
      mode: payload.mode,
      onClose: teardown,
    });
  } catch {
    // selector 在当前页未命中:静默忽略(用户可能不在原始页面)
    handle = null;
    return;
  }

  // sandbox iframe 加载完成后,用组件当前版本文件渲染
  const { iframe } = handle;
  client = createSandboxClient(iframe);
  const render = (): void => {
    void client?.render(payload.files.tsx, payload.files.css);
  };
  iframe.addEventListener('load', render, { once: true });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    // 幂等:重复 executeScript 注入时已挂监听则直接返回
    if (window.__compliftOverlayActive === true) return;
    window.__compliftOverlayActive = true;

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isOverlayShowMessage(message)) {
        show(message);
      } else if (isOverlayHideMessage(message)) {
        teardown();
      }
    });
  },
});
