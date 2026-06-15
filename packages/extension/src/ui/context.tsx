import { createContext, useContext, useRef, type ReactNode } from 'react';
import { createSandboxClient, type SandboxClient } from '../lib/sandbox-protocol';
import type { PlatformAdapter } from '../platform/adapter';
import { createWorkbenchStore, type WorkbenchStore } from './store';
import type { StoreApi, UseBoundStore } from 'zustand';

/**
 * Factory that wires a preview iframe to a render channel. The real one builds a
 * postMessage sandbox client; tests inject a prop-recording stub. This is the
 * ONLY Stage injection seam (no PREVIEW_MODE branching — ARC-4 / discipline).
 */
export type SandboxClientFactory = (iframe: HTMLIFrameElement) => SandboxClient;

interface WorkbenchContextValue {
  adapter: PlatformAdapter;
  store: UseBoundStore<StoreApi<WorkbenchStore>>;
  sandboxFactory: SandboxClientFactory;
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export interface WorkbenchProviderProps {
  adapter: PlatformAdapter;
  /** Override the sandbox client factory (tests pass a recording stub). */
  sandboxFactory?: SandboxClientFactory;
  children: ReactNode;
}

export function WorkbenchProvider({
  adapter,
  sandboxFactory = createSandboxClient,
  children,
}: WorkbenchProviderProps): React.JSX.Element {
  // One store instance per provider mount.
  const storeRef = useRef<UseBoundStore<StoreApi<WorkbenchStore>>>(undefined);
  storeRef.current ??= createWorkbenchStore();
  const valueRef = useRef<WorkbenchContextValue>(undefined);
  valueRef.current ??= { adapter, store: storeRef.current, sandboxFactory };
  // Keep adapter/factory live without recreating the store.
  valueRef.current.adapter = adapter;
  valueRef.current.sandboxFactory = sandboxFactory;

  return (
    <WorkbenchContext.Provider value={valueRef.current}>{children}</WorkbenchContext.Provider>
  );
}

function useWorkbenchContext(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (ctx === null) {
    throw new Error('useWorkbench* must be used within <WorkbenchProvider>');
  }
  return ctx;
}

export function useAdapter(): PlatformAdapter {
  return useWorkbenchContext().adapter;
}

export function useSandboxFactory(): SandboxClientFactory {
  return useWorkbenchContext().sandboxFactory;
}

/** Subscribe to a slice of the workbench store. */
export function useWorkbench<T>(selector: (s: WorkbenchStore) => T): T {
  return useWorkbenchContext().store(selector);
}
