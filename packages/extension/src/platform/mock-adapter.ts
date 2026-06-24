import { createRouter } from '../background/router';
import { generate } from '../lib/generate/generator';
import type { BroadcastEvent, RpcMap, RpcMethod } from '../lib/messages';
import { createComponentStore } from '../lib/store/component-store';
import type { CaptureIR, IRNode } from '../lib/types';
import type { PlatformAdapter } from './adapter';

export interface MockFixture {
  /** generate() 的命名 hint,PascalCase 组件名 */
  name: string;
  ir: CaptureIR;
  sourceUrl: string;
  sourceSelector: string;
  extraVersions: {
    tsx: string;
    css: string;
    author: 'manual' | 'agent';
    message: string;
  }[];
}

function makeIR(root: IRNode, pageTitle: string, baseUrl: string, rect: { width: number; height: number }): CaptureIR {
  return { root, baseUrl, pageTitle, viewport: { width: 1440, height: 900 }, rect };
}

/** 用 generate() 真实产物造一个变体版本(同名组件,不同样式) */
function variantFiles(fixtureName: string, ir: CaptureIR, styles: Record<string, string>): { tsx: string; css: string } {
  const variant: CaptureIR = { ...ir, root: { ...ir.root, styles } };
  const { tsx, css } = generate(variant, { name: fixtureName });
  return { tsx, css };
}

export function defaultFixtures(): MockFixture[] {
  const pricingIR = makeIR(
    {
      tag: 'div',
      attrs: { 'data-original-class': 'pricing card' },
      styles: { padding: '24px', 'border-radius': '12px', background: 'rgb(255, 255, 255)' },
      children: [
        {
          tag: 'h3',
          attrs: {},
          styles: { 'font-size': '18px', color: 'rgb(20, 20, 20)' },
          children: [{ text: 'Pro Plan' }],
        },
        {
          tag: 'p',
          attrs: {},
          styles: { 'font-size': '32px', 'font-weight': '700' },
          children: [{ text: '$29/mo' }],
        },
      ],
    },
    'Acme Pricing',
    'https://acme.example.com/pricing',
    { width: 320, height: 420 },
  );

  const navIR = makeIR(
    {
      tag: 'nav',
      attrs: { 'data-original-class': 'navbar' },
      styles: { display: 'flex', gap: '16px', padding: '12px 24px' },
      children: [
        {
          tag: 'a',
          attrs: { href: '/' },
          styles: { color: 'rgb(0, 102, 204)' },
          children: [{ text: 'Home' }],
        },
        {
          tag: 'a',
          attrs: { href: '/docs' },
          styles: { color: 'rgb(0, 102, 204)' },
          children: [{ text: 'Docs' }],
        },
      ],
    },
    'Devtool Docs',
    'https://devtool.example.com/',
    { width: 960, height: 56 },
  );

  const heroIR = makeIR(
    {
      tag: 'section',
      attrs: { 'data-original-class': 'hero banner' },
      styles: { padding: '64px 32px', 'text-align': 'center' },
      children: [
        {
          tag: 'h1',
          attrs: {},
          styles: { 'font-size': '48px', 'line-height': '1.1' },
          children: [{ text: 'Build faster' }],
        },
      ],
    },
    'Launchpad Landing',
    'https://launchpad.example.com/home',
    { width: 1200, height: 360 },
  );

  return [
    {
      name: 'PricingCard',
      ir: pricingIR,
      sourceUrl: 'https://acme.example.com/pricing',
      sourceSelector: 'main > div.pricing.card',
      extraVersions: [],
    },
    {
      name: 'NavBar',
      ir: navIR,
      sourceUrl: 'https://devtool.example.com/',
      sourceSelector: 'body > nav.navbar',
      extraVersions: [
        {
          ...variantFiles('NavBar', navIR, { display: 'flex', gap: '24px', padding: '12px 24px' }),
          author: 'manual',
          message: 'widen item gap',
        },
        {
          ...variantFiles('NavBar', navIR, {
            display: 'flex',
            gap: '24px',
            padding: '12px 24px',
            'border-bottom': '1px solid rgb(230, 230, 230)',
          }),
          author: 'agent',
          message: 'add bottom divider',
        },
        {
          ...variantFiles('NavBar', navIR, {
            display: 'flex',
            gap: '24px',
            padding: '16px 32px',
            'border-bottom': '1px solid rgb(230, 230, 230)',
          }),
          author: 'agent',
          message: 'increase padding for touch targets',
        },
      ],
    },
    {
      name: 'HeroBanner',
      ir: heroIR,
      sourceUrl: 'https://launchpad.example.com/home',
      sourceSelector: 'main > section.hero',
      extraVersions: [
        {
          ...variantFiles('HeroBanner', heroIR, {
            padding: '80px 32px',
            'text-align': 'center',
            background: 'rgb(15, 23, 42)',
          }),
          author: 'manual',
          message: 'dark hero background',
        },
      ],
    },
  ];
}

let mockDbCounter = 0;

/** 内存版 PlatformAdapter:真 store + 真 router + 真 generate,UI 测试与 preview 的地基。 */
export function createMockAdapter(fixtures: MockFixture[] = defaultFixtures()): PlatformAdapter {
  mockDbCounter += 1;
  const store = createComponentStore(`complift-mock-${Date.now()}-${mockDbCounter}`);
  const listeners = new Set<(e: BroadcastEvent) => void>();
  const broadcast = (e: BroadcastEvent): void => {
    for (const cb of listeners) cb(e);
  };
  const router = createRouter({
    store,
    generate,
    injectPicker: async () => {},
    stopPicker: async () => {},
    injectOverlay: async () => {},
    hideOverlay: async () => {},
    relayStatus: () => false,
    broadcast,
  });

  const ready = (async () => {
    for (const fixture of fixtures) {
      const generated = generate(fixture.ir, { name: fixture.name });
      const { component } = await store.createFromCapture(
        {
          name: generated.componentName,
          sourceUrl: fixture.sourceUrl,
          sourceSelector: fixture.sourceSelector,
          width: fixture.ir.rect.width,
          height: fixture.ir.rect.height,
        },
        { tsx: generated.tsx, css: generated.css },
      );
      for (const extra of fixture.extraVersions) {
        await store.addVersion(
          component.id,
          { tsx: extra.tsx, css: extra.css },
          extra.author,
          extra.message,
        );
      }
    }
  })();

  return {
    async rpc<M extends RpcMethod>(method: M, params: RpcMap[M]['req']): Promise<RpcMap[M]['res']> {
      await ready;
      const res = await router.handle({
        kind: 'complift:rpc',
        id: crypto.randomUUID(),
        method,
        params,
      });
      if (!res.ok) throw new Error(res.error ?? `rpc failed: ${method}`);
      return res.data as RpcMap[M]['res'];
    },

    onEvent(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    sandboxUrl() {
      return '/sandbox-mock.html';
    },

    async openStandalone() {
      // preview / 测试环境无独立窗,no-op。
    },
  };
}
