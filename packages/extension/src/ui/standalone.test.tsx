import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import type { BroadcastEvent } from '../lib/messages';
import type { SandboxClient } from '../lib/sandbox-protocol';
import type { PlatformAdapter } from '../platform/adapter';
import { createMockAdapter } from '../platform/mock-adapter';
import { Standalone, type SandboxClientFactory } from './Standalone';

function makeRecordingSandbox(): {
  factory: SandboxClientFactory;
  renders: { tsx: string; css: string }[];
} {
  const renders: { tsx: string; css: string }[] = [];
  const factory: SandboxClientFactory = () => {
    const client: SandboxClient = {
      render: vi.fn(async (tsx: string, css: string) => {
        renders.push({ tsx, css });
        return { ok: true, size: { width: 320, height: 200 } };
      }),
      onSize: vi.fn(() => () => {}),
      dispose: vi.fn(),
    };
    return client;
  };
  return { factory, renders };
}

/** Wrap a mock adapter so the test can emit broadcast events through onEvent. */
function withBroadcast(adapter: PlatformAdapter): {
  adapter: PlatformAdapter;
  emit: (e: BroadcastEvent) => void;
} {
  const listeners = new Set<(e: BroadcastEvent) => void>();
  const wrapped: PlatformAdapter = {
    rpc: adapter.rpc.bind(adapter),
    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    sandboxUrl: adapter.sandboxUrl.bind(adapter),
    openStandalone: adapter.openStandalone.bind(adapter),
  };
  return { adapter: wrapped, emit: (e) => listeners.forEach((cb) => cb(e)) };
}

async function firstComponentId(adapter: PlatformAdapter): Promise<string> {
  const list = await adapter.rpc('component:list', {});
  const id = list[0]?.id;
  if (id === undefined) throw new Error('no fixtures');
  return id;
}

afterEach(cleanup);

describe('Standalone preview window', () => {
  it('fetches the head version and renders it into the sandbox', async () => {
    const adapter = createMockAdapter();
    const id = await firstComponentId(adapter);
    const sandbox = makeRecordingSandbox();

    render(<Standalone adapter={adapter} componentId={id} sandboxFactory={sandbox.factory} />);

    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(0));
    expect(sandbox.renders[0]?.tsx).toContain('export default');
    expect(screen.getByTestId('standalone-iframe')).toBeTruthy();
  });

  it('viewport preset bar switches the iframe width', async () => {
    const adapter = createMockAdapter();
    const id = await firstComponentId(adapter);
    const sandbox = makeRecordingSandbox();

    render(<Standalone adapter={adapter} componentId={id} sandboxFactory={sandbox.factory} />);
    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(0));

    const iframe = screen.getByTestId('standalone-iframe') as HTMLIFrameElement;
    fireEvent.click(screen.getByText('375'));
    expect(iframe.style.width).toBe('375px');
    fireEvent.click(screen.getByText('1440'));
    expect(iframe.style.width).toBe('1440px');
  });

  it('hot-reloads when component:changed fires for this component', async () => {
    const base = createMockAdapter();
    const id = await firstComponentId(base);
    const { adapter, emit } = withBroadcast(base);
    const sandbox = makeRecordingSandbox();

    render(<Standalone adapter={adapter} componentId={id} sandboxFactory={sandbox.factory} />);
    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(0));
    const before = sandbox.renders.length;

    await base.rpc('component:update', {
      componentId: id,
      tsx: 'export default function X(){ return null; }',
      css: '',
      author: 'agent',
      message: 'edit',
    });
    emit({ kind: 'complift:event', type: 'component:changed', componentId: id });

    await waitFor(() => expect(sandbox.renders.length).toBeGreaterThan(before));
  });

  it('shows an error when componentId is missing', async () => {
    const adapter = createMockAdapter();
    const sandbox = makeRecordingSandbox();

    render(<Standalone adapter={adapter} componentId="" sandboxFactory={sandbox.factory} />);

    expect(await screen.findByTestId('standalone-error')).toBeTruthy();
  });
});
