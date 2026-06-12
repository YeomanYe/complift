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
