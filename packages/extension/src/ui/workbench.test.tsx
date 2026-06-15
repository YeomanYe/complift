import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { createMockAdapter } from '../platform/mock-adapter';
import type { PlatformAdapter } from '../platform/adapter';
import type { BroadcastEvent } from '../lib/messages';
import type { SandboxClient } from '../lib/sandbox-protocol';
import { Workbench } from './Workbench';
import type { SandboxClientFactory } from './context';

/**
 * Prop-recording sandbox stub: records every render(tsx, css) call so tests can
 * assert the Stage drives the preview, without a real postMessage iframe.
 */
function makeRecordingSandbox(): {
  factory: SandboxClientFactory;
  renders: { tsx: string; css: string }[];
} {
  const renders: { tsx: string; css: string }[] = [];
  const factory: SandboxClientFactory = () => {
    const client: SandboxClient = {
      render: vi.fn(async (tsx: string, css: string) => {
        renders.push({ tsx, css });
        return { ok: true, size: { width: 240, height: 200 } };
      }),
      onSize: vi.fn(() => () => {}),
      dispose: vi.fn(),
    };
    return client;
  };
  return { factory, renders };
}

/**
 * Wrap a real mock adapter so the test can push backend broadcast events
 * (relay:status, component:changed, …) through the same onEvent channel the UI
 * subscribes to — the adapter boundary stays the only injection seam.
 */
function withBroadcast(adapter: PlatformAdapter): {
  adapter: PlatformAdapter;
  emit: (e: BroadcastEvent) => void;
} {
  const listeners = new Set<(e: BroadcastEvent) => void>();
  const wrapped: PlatformAdapter = {
    rpc: adapter.rpc.bind(adapter),
    onEvent(cb) {
      const unsubInner = adapter.onEvent(cb);
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
        unsubInner();
      };
    },
    sandboxUrl: adapter.sandboxUrl.bind(adapter),
    openStandalone: adapter.openStandalone.bind(adapter),
  };
  const emit = (e: BroadcastEvent): void => {
    for (const cb of listeners) cb(e);
  };
  return { adapter: wrapped, emit };
}

function renderWorkbench(adapter: PlatformAdapter, sandboxFactory: SandboxClientFactory) {
  return render(<Workbench adapter={adapter} sandboxFactory={sandboxFactory} />);
}

afterEach(() => {
  cleanup();
});

describe('Workbench — Drafting Bench', () => {
  let sandbox: ReturnType<typeof makeRecordingSandbox>;

  beforeEach(() => {
    sandbox = makeRecordingSandbox();
  });

  it('shows empty-state copy when there are no clones', async () => {
    const adapter = createMockAdapter([]);
    renderWorkbench(adapter, sandbox.factory);
    expect(await screen.findByText(/NO COMPONENT ON STAGE/i)).toBeDefined();
    expect(screen.getByText(/NO CLONES YET/i)).toBeDefined();
  });

  it('loads fixtures into the filmstrip (one clip per component)', async () => {
    const adapter = createMockAdapter(); // 3 default fixtures
    renderWorkbench(adapter, sandbox.factory);
    const clips = await screen.findAllByTestId('filmstrip-clip');
    expect(clips).toHaveLength(3);
  });

  it('re-renders the Stage preview when switching components', async () => {
    const adapter = createMockAdapter();
    renderWorkbench(adapter, sandbox.factory);
    const clips = await screen.findAllByTestId('filmstrip-clip');

    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(0));
    const before = sandbox.renders.length;
    const firstTsx = sandbox.renders[sandbox.renders.length - 1]!.tsx;

    // Switch to a different component → Stage should render different files.
    const other = clips.find((c) => c.getAttribute('aria-selected') !== 'true')!;
    fireEvent.click(other);

    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(before));
    const afterTsx = sandbox.renders[sandbox.renders.length - 1]!.tsx;
    expect(afterTsx).not.toBe(firstTsx);
  });

  it('lists version history and rolls back via the rollback RPC', async () => {
    const adapter = createMockAdapter();
    const rpcSpy = vi.spyOn(adapter, 'rpc');
    renderWorkbench(adapter, sandbox.factory);

    // Select the NavBar component (it has multiple versions: capture + 3 extras).
    const clips = await screen.findAllByTestId('filmstrip-clip');
    const navClip = clips.find((c) => /navbar/i.test(c.textContent ?? ''))!;
    fireEvent.click(navClip);
    await waitFor(() => expect(navClip.getAttribute('aria-selected')).toBe('true'));

    // Open History tab.
    fireEvent.click(screen.getByRole('tab', { name: 'HISTORY' }));

    const entries = await screen.findAllByTestId('history-entry');
    expect(entries).toHaveLength(4); // 1 capture + 3 extra versions

    // Roll back to an older (non-head) version.
    const rollbackBtns = screen.getAllByTestId('rollback-btn');
    expect(rollbackBtns.length).toBeGreaterThan(0);
    rpcSpy.mockClear();
    fireEvent.click(rollbackBtns[rollbackBtns.length - 1]!);

    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith(
        'component:rollback',
        expect.objectContaining({ versionId: expect.any(String) }),
      ),
    );
  });

  it('"Open window" calls openStandalone with the current component id', async () => {
    const adapter = createMockAdapter();
    const openSpy = vi.spyOn(adapter, 'openStandalone');
    renderWorkbench(adapter, sandbox.factory);

    const clips = await screen.findAllByTestId('filmstrip-clip');
    fireEvent.click(clips[0]!);
    await waitFor(() => expect(clips[0]!.getAttribute('aria-selected')).toBe('true'));

    fireEvent.click(screen.getByText(/OPEN WINDOW/i));
    expect(openSpy).toHaveBeenCalledWith(expect.any(String));
  });

  it('saves edited code via the component:update RPC (author manual)', async () => {
    const adapter = createMockAdapter();
    const rpcSpy = vi.spyOn(adapter, 'rpc');
    renderWorkbench(adapter, sandbox.factory);

    await screen.findAllByTestId('filmstrip-clip');
    // Code tab is the default inspector tab.
    const saveBtn = (await screen.findByTestId('save-btn')) as HTMLButtonElement;
    await waitFor(() => expect(saveBtn.disabled).toBe(false));
    rpcSpy.mockClear();
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(rpcSpy).toHaveBeenCalledWith(
        'component:update',
        expect.objectContaining({
          author: 'manual',
          tsx: expect.any(String),
          css: expect.any(String),
        }),
      ),
    );
  });

  it('drops a stale slow select response (last-action-wins, not last-resolve-wins)', async () => {
    // Wrap the mock adapter so the FIRST component:get resolves slower than the
    // SECOND, simulating a fast A→B click where A's response lands last.
    const base = createMockAdapter();
    let getCalls = 0;
    let releaseSlowGet: (() => void) | null = null;
    const slowGate = new Promise<void>((resolve) => {
      releaseSlowGet = resolve;
    });
    const adapter: PlatformAdapter = {
      async rpc(method, params) {
        if (method === 'component:get') {
          getCalls += 1;
          // The first explicit select (call #2 — call #1 is the initial load)
          // is held until we release it AFTER the second select resolves.
          if (getCalls === 2) await slowGate;
        }
        return base.rpc(method, params);
      },
      onEvent: base.onEvent.bind(base),
      sandboxUrl: base.sandboxUrl.bind(base),
      openStandalone: base.openStandalone.bind(base),
    };

    renderWorkbench(adapter, sandbox.factory);
    const clips = await screen.findAllByTestId('filmstrip-clip');
    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(0));

    const initiallySelected = clips.find((c) => c.getAttribute('aria-selected') === 'true')!;
    const others = clips.filter((c) => c !== initiallySelected);
    const slowTarget = others[0]!; // select A (held)
    const fastTarget = others[1]!; // select B (resolves first, should win)

    const fastName = fastTarget.textContent ?? '';

    // Fire A (slow) then B (fast). B resolves while A is still gated.
    fireEvent.click(slowTarget);
    fireEvent.click(fastTarget);

    // B (the LAST action) wins the stage.
    await waitFor(() => expect(fastTarget.getAttribute('aria-selected')).toBe('true'));

    // Now release the stale slow response for A — it must NOT overwrite B.
    act(() => releaseSlowGet!());
    await new Promise((r) => setTimeout(r, 0));

    await waitFor(() => expect(fastTarget.getAttribute('aria-selected')).toBe('true'));
    expect(slowTarget.getAttribute('aria-selected')).not.toBe('true');
    // Version badge / filmstrip still reflect B, not the stale A.
    expect(fastTarget.getAttribute('aria-selected')).toBe('true');
    expect(fastName.length).toBeGreaterThan(0);
  });

  it('keeps the pinned history version on stage when a broadcast refresh lands', async () => {
    const base = createMockAdapter();
    const { adapter, emit } = withBroadcast(base);
    renderWorkbench(adapter, sandbox.factory);

    // Select NavBar (multi-version) and open its History.
    const clips = await screen.findAllByTestId('filmstrip-clip');
    const navClip = clips.find((c) => /navbar/i.test(c.textContent ?? ''))!;
    fireEvent.click(navClip);
    await waitFor(() => expect(navClip.getAttribute('aria-selected')).toBe('true'));
    fireEvent.click(screen.getByRole('tab', { name: 'HISTORY' }));

    const entriesBefore = await screen.findAllByTestId('history-entry');
    const countBefore = entriesBefore.length;

    // Pin an OLD (non-head) version read-only via "查看".
    // history() is sorted oldest-first, so the first entry is v1.
    const viewBtns = screen.getAllByTestId('view-version-btn');
    fireEvent.click(viewBtns[0]!); // oldest entry = v1
    const hint = await screen.findByText(/VIEWING v1 ·/);
    expect(hint).toBeDefined();

    // Find NavBar's component id, push a fresh agent version, then broadcast.
    const components = await base.rpc('component:list', {});
    const nav = components.find((c) => /navbar/i.test(c.name))!;
    await base.rpc('component:update', {
      componentId: nav.id,
      tsx: 'export function NavBar(){return null}',
      css: '/* refreshed */',
      author: 'agent',
      message: 'broadcast bump',
    });
    act(() => {
      emit({ kind: 'complift:event', type: 'component:changed', componentId: nav.id });
    });

    // Timeline gains the new entry…
    await waitFor(() =>
      expect(screen.getAllByTestId('history-entry').length).toBe(countBefore + 1),
    );
    // …but the user stays pinned on v1 (not yanked to head).
    expect(screen.getByText(/VIEWING v1 ·/)).toBeDefined();
  });

  it('reflects a relay:status broadcast in the StatusBar', async () => {
    const base = createMockAdapter();
    const { adapter, emit } = withBroadcast(base);
    renderWorkbench(adapter, sandbox.factory);
    await screen.findAllByTestId('filmstrip-clip');

    const status = screen.getByTestId('relay-status');
    expect(status.getAttribute('data-connected')).toBe('false');
    expect(within(status).getByText(/PLOTTER: OFFLINE/i)).toBeDefined();
    expect(screen.getByText(/MCP :8765/i)).toBeDefined();

    // Backend reports the relay came online.
    act(() => {
      emit({ kind: 'complift:event', type: 'relay:status', connected: true });
    });

    await waitFor(() =>
      expect(screen.getByTestId('relay-status').getAttribute('data-connected')).toBe('true'),
    );
    expect(within(screen.getByTestId('relay-status')).getByText(/PLOTTER: ONLINE/i)).toBeDefined();
  });
});
