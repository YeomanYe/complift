import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ClonedComponent, ComponentVersion } from '../lib/types';
import type { PlatformAdapter } from '../platform/adapter';

export type WorkbenchState = 'normal' | 'empty' | 'loading' | 'error';

export interface WorkbenchStore {
  /** All cloned components (filmstrip source). */
  components: ClonedComponent[];
  /** Selected component id, or null when none on stage. */
  currentId: string | null;
  /** The version currently shown on the Stage (head, or a pinned older one). */
  currentVersion: ComponentVersion | null;
  /** Whether `currentVersion` is an older version being previewed read-only. */
  viewingHistory: boolean;
  /** History (newest first) of the current component. */
  history: ComponentVersion[];
  state: WorkbenchState;
  /** Last error message, when `state === 'error'`. */
  error: string | null;
  /** Local relay / agent connection indicator. */
  relayConnected: boolean;

  /** Load components + relay status, select the first component if any. */
  load(adapter: PlatformAdapter): Promise<void>;
  /** Switch the component on stage (resets to head version). */
  select(adapter: PlatformAdapter, componentId: string): Promise<void>;
  /** Pin an older version on the Stage (read-only view). */
  viewVersion(adapter: PlatformAdapter, versionId: string): Promise<void>;
  /** Persist edited code as a new manual version, then show it. */
  saveCode(adapter: PlatformAdapter, tsx: string, css: string, message?: string): Promise<void>;
  /** Roll back to a version; produces a new head version pointing at old content. */
  rollback(adapter: PlatformAdapter, versionId: string): Promise<void>;
  /** Re-fetch the current component + history (used on broadcast events). */
  refreshCurrent(adapter: PlatformAdapter): Promise<void>;
  /** Update the relay indicator (used on relay:status broadcast). */
  setRelayConnected(connected: boolean): void;
}

async function loadComponentInto(
  adapter: PlatformAdapter,
  componentId: string,
): Promise<{ component: ClonedComponent; version: ComponentVersion; history: ComponentVersion[] }> {
  const [{ component, version }, history] = await Promise.all([
    adapter.rpc('component:get', { componentId }),
    adapter.rpc('component:history', { componentId }),
  ]);
  return { component, version, history };
}

export const createWorkbenchStore = (): UseBoundStore<StoreApi<WorkbenchStore>> =>
  create<WorkbenchStore>((set, get) => ({
    components: [],
    currentId: null,
    currentVersion: null,
    viewingHistory: false,
    history: [],
    state: 'loading',
    error: null,
    relayConnected: false,

    async load(adapter) {
      set({ state: 'loading', error: null });
      try {
        const [components, relay] = await Promise.all([
          adapter.rpc('component:list', {}),
          adapter.rpc('relay:status', {}),
        ]);
        if (components.length === 0) {
          set({
            components,
            currentId: null,
            currentVersion: null,
            history: [],
            viewingHistory: false,
            state: 'empty',
            relayConnected: relay.connected,
          });
          return;
        }
        const first = components[0]!;
        const loaded = await loadComponentInto(adapter, first.id);
        set({
          components,
          currentId: first.id,
          currentVersion: loaded.version,
          history: loaded.history,
          viewingHistory: false,
          state: 'normal',
          relayConnected: relay.connected,
        });
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    async select(adapter, componentId) {
      if (componentId === get().currentId && !get().viewingHistory) return;
      try {
        const loaded = await loadComponentInto(adapter, componentId);
        set({
          currentId: componentId,
          currentVersion: loaded.version,
          history: loaded.history,
          viewingHistory: false,
          state: 'normal',
          error: null,
        });
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    async viewVersion(adapter, versionId) {
      const componentId = get().currentId;
      if (componentId === null) return;
      try {
        const { component, version } = await adapter.rpc('component:get', {
          componentId,
          versionId,
        });
        set({
          currentVersion: version,
          viewingHistory: version.id !== component.headVersionId,
        });
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    async saveCode(adapter, tsx, css, message = 'manual edit') {
      const componentId = get().currentId;
      if (componentId === null) return;
      try {
        await adapter.rpc('component:update', {
          componentId,
          tsx,
          css,
          author: 'manual',
          message,
        });
        await get().refreshCurrent(adapter);
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    async rollback(adapter, versionId) {
      const componentId = get().currentId;
      if (componentId === null) return;
      try {
        await adapter.rpc('component:rollback', { componentId, versionId });
        await get().refreshCurrent(adapter);
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    async refreshCurrent(adapter) {
      const componentId = get().currentId;
      if (componentId === null) return;
      try {
        const [components, loaded] = await Promise.all([
          adapter.rpc('component:list', {}),
          loadComponentInto(adapter, componentId),
        ]);
        set({
          components,
          currentVersion: loaded.version,
          history: loaded.history,
          viewingHistory: false,
          state: 'normal',
          error: null,
        });
      } catch (err) {
        set({ state: 'error', error: messageOf(err) });
      }
    },

    setRelayConnected(connected) {
      set({ relayConnected: connected });
    },
  }));

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
