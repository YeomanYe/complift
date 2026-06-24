import { beforeEach, describe, expect, it, vi } from 'vitest';

type ActionClickListener = (tab: { id?: number; windowId?: number }) => void;

const mockBrowser = vi.hoisted(() => {
  let actionClickListener: ActionClickListener | null = null;
  return {
    getActionClickListener: () => actionClickListener,
    resetActionClickListener: () => {
      actionClickListener = null;
    },
    browser: {
      runtime: {
        onMessage: { addListener: vi.fn() },
        sendMessage: vi.fn(() => Promise.resolve()),
        getURL: vi.fn((path: string) => `chrome-extension://complift${path}`),
      },
      tabs: {
        query: vi.fn(async () => [{ id: 99 }]),
        sendMessage: vi.fn(async () => undefined),
      },
      scripting: {
        executeScript: vi.fn(async () => undefined),
      },
      sidePanel: {
        open: vi.fn(async () => undefined),
      },
      action: {
        onClicked: {
          addListener: vi.fn((listener: ActionClickListener) => {
            actionClickListener = listener;
          }),
        },
      },
    },
  };
});

vi.mock('wxt/browser', () => ({ browser: mockBrowser.browser }));
vi.mock('./relay-client', () => ({
  startRelayClient: vi.fn(),
}));
vi.mock('../lib/store/component-store', () => ({
  createComponentStore: vi.fn(() => ({})),
}));
vi.mock('../lib/generate/generator', () => ({
  generate: vi.fn(),
}));

describe('background action click', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockBrowser.resetActionClickListener();
  });

  it('opens the side panel and starts picking in the clicked tab', async () => {
    const background = await import('../../entrypoints/background');
    background.default.main();

    const listener = mockBrowser.getActionClickListener();
    expect(listener).toBeTypeOf('function');

    listener?.({ id: 42, windowId: 7 });

    await vi.waitFor(() => {
      expect(mockBrowser.browser.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
      expect(mockBrowser.browser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ['/content-scripts/picker.js'],
      });
    });
  });
});
