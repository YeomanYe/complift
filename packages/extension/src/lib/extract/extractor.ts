/**
 * 元素提取器：DFS 遍历目标元素子树，输出纯数据 CaptureIR。
 * - 样式：getComputedStyle 与同 tag 默认基线 diff（仅 STYLE_ALLOWLIST）
 * - attrs：丢 on* / style，class → data-original-class，资源 URL 绝对化
 * - 丢弃 script 等无关节点；svg 子树原样保留
 * 运行环境是真实 Chrome content script；getComputedStyle 拿不到值时容错跳过。
 */
import type { CaptureIR, IRNode, IRText } from '../types';
import { getDefaultStyles, INHERITED_PROPS, STYLE_ALLOWLIST } from './defaults';

const DEFAULT_MAX_NODES = 500;
const DROP_TAGS = new Set([
  'script',
  'noscript',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'template',
]);
const URL_ATTRS: Record<string, readonly string[]> = {
  img: ['src'],
  a: ['href'],
  source: ['src'],
};
const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

interface WalkState {
  count: number;
  maxNodes: number;
  doc: Document;
  baseUrl: string;
}

export function extractElement(el: Element, opts?: { maxNodes?: number }): CaptureIR {
  const doc = el.ownerDocument;
  const baseUrl = doc.baseURI;
  const state: WalkState = {
    count: 0,
    maxNodes: opts?.maxNodes ?? DEFAULT_MAX_NODES,
    doc,
    baseUrl,
  };
  const root = buildNode(el, state, {}, el.namespaceURI === SVG_NS);

  const view = doc.defaultView;
  const rect = el.getBoundingClientRect();
  return {
    root,
    baseUrl,
    pageTitle: doc.title,
    viewport: { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 },
    rect: { width: rect.width, height: rect.height },
  };
}

function buildNode(
  el: Element,
  state: WalkState,
  inheritedCtx: Record<string, string>,
  inSvg: boolean,
): IRNode {
  state.count += 1;
  const tag = el.tagName.toLowerCase();
  const attrs = inSvg ? rawAttrs(el) : cleanAttrs(el, tag, state.baseUrl);
  const styles = inSvg ? {} : diffStyles(el, tag, state, inheritedCtx);

  // 继承上下文向下传递：父链上已记录的继承属性值，子元素相同则跳过
  const childCtx = inSvg ? inheritedCtx : { ...inheritedCtx };
  if (!inSvg) {
    for (const [prop, value] of Object.entries(styles)) {
      if (INHERITED_PROPS.has(prop)) childCtx[prop] = value;
    }
  }

  const children: (IRNode | IRText)[] = [];
  let truncated = false;
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      const text = child.textContent ?? '';
      if (text.trim() !== '') children.push({ text });
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue; // 注释等一律丢弃
    const childEl = child as Element; // nodeType === ELEMENT_NODE 已保证，TS 推不出 Node→Element
    const childTag = childEl.tagName.toLowerCase();
    if (DROP_TAGS.has(childTag)) continue;
    if (state.count >= state.maxNodes) {
      truncated = true;
      break;
    }
    children.push(buildNode(childEl, state, childCtx, inSvg || childEl.namespaceURI === SVG_NS));
  }
  if (truncated) attrs['data-complift-truncated'] = 'true';

  return { tag, attrs, styles, children };
}

/** svg 子树：attrs 原样保留，不做清洗 */
function rawAttrs(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  return attrs;
}

function cleanAttrs(el: Element, tag: string, baseUrl: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'style') continue;
    if (name === 'class') {
      attrs['data-original-class'] = attr.value;
      continue;
    }
    attrs[name] = URL_ATTRS[tag]?.includes(name) ? absolutizeUrl(attr.value, baseUrl) : attr.value;
  }
  return attrs;
}

function diffStyles(
  el: Element,
  tag: string,
  state: WalkState,
  inheritedCtx: Record<string, string>,
): Record<string, string> {
  const styles: Record<string, string> = {};
  const view = state.doc.defaultView;
  if (!view) return styles;
  let computed: CSSStyleDeclaration;
  try {
    computed = view.getComputedStyle(el);
  } catch {
    return styles;
  }
  const defaults = getDefaultStyles(tag, state.doc);
  for (const prop of STYLE_ALLOWLIST) {
    let value = '';
    try {
      value = computed.getPropertyValue(prop);
    } catch {
      continue; // 环境拿不到该属性 → 容错跳过
    }
    if (!value) continue;
    if (value === defaults[prop]) continue;
    if (INHERITED_PROPS.has(prop) && inheritedCtx[prop] === value) continue;
    styles[prop] = prop === 'background-image' ? absolutizeCssUrls(value, state.baseUrl) : value;
  }
  return styles;
}

function absolutizeUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

/** 把 background-image 等 css 值里的 url(...) 绝对化；data: URL 原样保留 */
function absolutizeCssUrls(value: string, baseUrl: string): string {
  return value.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (match, _quote, url: string) => {
    if (url === '' || url.startsWith('data:')) return match;
    try {
      return `url("${new URL(url, baseUrl).href}")`;
    } catch {
      return match;
    }
  });
}
