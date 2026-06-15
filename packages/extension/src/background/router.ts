import type { generate } from '../lib/generate/generator';
import type {
  BroadcastEvent,
  RpcMap,
  RpcMethod,
  RpcRequest,
  RpcResponse,
} from '../lib/messages';
import type { ComponentStore } from '../lib/store/component-store';

export interface OverlayPayload {
  componentId: string;
  opacity: number;
  mode: 'overlay' | 'difference';
  files: { tsx: string; css: string };
  sourceSelector: string;
}

/** Wire message: background → overlay content script (show with payload). */
export interface OverlayShowMessage {
  kind: 'complift:overlay-show';
  payload: OverlayPayload;
  /** Web-accessible sandbox URL for the overlay iframe (resolved by background). */
  sandboxUrl: string;
}

/** Wire message: background → overlay content script (tear down). */
export interface OverlayHideMessage {
  kind: 'complift:overlay-hide';
}

const isOverlayPayload = (p: unknown): p is OverlayPayload => {
  if (typeof p !== 'object' || p === null) return false;
  const payload = p as Record<string, unknown>;
  const files = payload.files as Record<string, unknown> | null | undefined;
  return typeof payload.componentId === 'string'
    && typeof payload.opacity === 'number'
    && (payload.mode === 'overlay' || payload.mode === 'difference')
    && typeof payload.sourceSelector === 'string'
    && typeof files === 'object' && files !== null
    && typeof files.tsx === 'string'
    && typeof files.css === 'string';
};

export const isOverlayShowMessage = (m: unknown): m is OverlayShowMessage => {
  if (typeof m !== 'object' || m === null) return false;
  const msg = m as Record<string, unknown>;
  return msg.kind === 'complift:overlay-show'
    && typeof msg.sandboxUrl === 'string'
    && isOverlayPayload(msg.payload);
};

export const isOverlayHideMessage = (m: unknown): m is OverlayHideMessage => {
  if (typeof m !== 'object' || m === null) return false;
  return (m as Record<string, unknown>).kind === 'complift:overlay-hide';
};

export interface RouterDeps {
  store: ComponentStore;
  generate: typeof generate;
  injectPicker(tabId: number | undefined): Promise<void>;
  injectOverlay(tabId: number | undefined, payload: OverlayPayload): Promise<void>;
  hideOverlay(tabId: number | undefined): Promise<void>;
  relayStatus(): boolean;
  broadcast(e: BroadcastEvent): void;
}

export interface Router {
  handle(req: RpcRequest): Promise<RpcResponse>;
}

type Handlers = {
  [M in RpcMethod]: (params: RpcMap[M]['req']) => Promise<RpcMap[M]['res']>;
};

export function createRouter(deps: RouterDeps): Router {
  const handlers: Handlers = {
    'component:list': () => deps.store.list(),

    async 'component:get'({ componentId, versionId }) {
      const component = await deps.store.get(componentId);
      const version = await deps.store.getVersion(versionId ?? component.headVersionId);
      return { component, version };
    },

    'component:history': ({ componentId }) => deps.store.history(componentId),

    async 'component:update'({ componentId, tsx, css, author, message }) {
      const version = await deps.store.addVersion(componentId, { tsx, css }, author, message);
      deps.broadcast({ kind: 'complift:event', type: 'component:changed', componentId });
      return version;
    },

    async 'component:rollback'({ componentId, versionId }) {
      const version = await deps.store.rollback(componentId, versionId);
      deps.broadcast({ kind: 'complift:event', type: 'component:changed', componentId });
      return version;
    },

    async 'component:delete'({ componentId }) {
      await deps.store.remove(componentId);
      return { ok: true };
    },

    async 'capture:create'({ ir, sourceUrl, sourceSelector }) {
      const generated = deps.generate(ir);
      const { component, version } = await deps.store.createFromCapture(
        {
          name: generated.componentName,
          sourceUrl,
          sourceSelector,
          width: ir.rect.width,
          height: ir.rect.height,
        },
        { tsx: generated.tsx, css: generated.css },
      );
      deps.broadcast({
        kind: 'complift:event',
        type: 'component:created',
        componentId: component.id,
      });
      deps.broadcast({
        kind: 'complift:event',
        type: 'picker:picked',
        componentId: component.id,
      });
      return { component, version };
    },

    async 'picker:start'({ tabId }) {
      await deps.injectPicker(tabId);
      return { ok: true };
    },

    async 'picker:cancel'() {
      return { ok: true };
    },

    async 'overlay:show'({ componentId, opacity, mode }) {
      const component = await deps.store.get(componentId);
      const head = await deps.store.getVersion(component.headVersionId);
      await deps.injectOverlay(undefined, {
        componentId,
        opacity,
        mode,
        files: head.files,
        sourceSelector: component.sourceSelector,
      });
      return { ok: true };
    },

    async 'overlay:hide'() {
      await deps.hideOverlay(undefined);
      return { ok: true };
    },

    async 'relay:status'() {
      return { connected: deps.relayStatus() };
    },
  };

  return {
    async handle(req) {
      const handler = handlers[req.method] as
        | ((params: RpcRequest['params']) => Promise<RpcResponse['data']>)
        | undefined;
      if (handler === undefined) {
        return { kind: 'complift:rpc-result', id: req.id, ok: false, error: 'unknown-method' };
      }
      try {
        const data = await handler(req.params);
        return { kind: 'complift:rpc-result', id: req.id, ok: true, data };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { kind: 'complift:rpc-result', id: req.id, ok: false, error: message };
      }
    },
  };
}
