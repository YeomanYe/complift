/**
 * 同 tag 默认样式基线：在隐藏容器里 createElement(tag) 取 computed style，
 * 按 (document, tag) 缓存。extractor 用它做 diff，只保留偏离默认的属性。
 */

/** 高价值样式属性 allowlist——extractor 只 diff 这些属性 */
export const STYLE_ALLOWLIST = [
  // 布局
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  // flex
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'order',
  // grid
  'grid-template-columns',
  'grid-template-rows',
  'grid-auto-flow',
  'grid-column',
  'grid-row',
  'gap',
  'row-gap',
  'column-gap',
  // 尺寸
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  // 外边距 / 内边距
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'overflow',
  'overflow-x',
  'overflow-y',
  // 文字
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'white-space',
  // 颜色 / 背景
  'color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  // 边框
  'border-top-width',
  'border-top-style',
  'border-top-color',
  'border-right-width',
  'border-right-style',
  'border-right-color',
  'border-bottom-width',
  'border-bottom-style',
  'border-bottom-color',
  'border-left-width',
  'border-left-style',
  'border-left-color',
  'border-radius',
  // 其他
  'box-shadow',
  'opacity',
  'cursor',
  'transition',
  'transform',
  'object-fit',
  'vertical-align',
  'list-style-type',
] as const;

/** allowlist 中受继承影响的属性——与父元素已记录值相同时跳过 */
export const INHERITED_PROPS: ReadonlySet<string> = new Set([
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'white-space',
  'color',
  'cursor',
  'list-style-type',
]);

const cache = new WeakMap<Document, Map<string, Record<string, string>>>();

/**
 * 取指定 tag 的默认 computed style 基线（仅 allowlist 内属性）。
 * getComputedStyle 不可用 / 取不到值时容错返回（可能为空对象）。
 */
export function getDefaultStyles(tag: string, doc: Document): Record<string, string> {
  let perDoc = cache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    cache.set(doc, perDoc);
  }
  const hit = perDoc.get(tag);
  if (hit) return hit;

  const result: Record<string, string> = {};
  try {
    const view = doc.defaultView;
    const body = doc.body;
    if (view && body) {
      const container = doc.createElement('div');
      container.style.position = 'absolute';
      container.style.visibility = 'hidden';
      const probe = doc.createElement(tag);
      container.appendChild(probe);
      body.appendChild(container);
      try {
        const cs = view.getComputedStyle(probe);
        for (const prop of STYLE_ALLOWLIST) {
          const value = cs.getPropertyValue(prop);
          if (value) result[prop] = value;
        }
      } finally {
        container.remove();
      }
    }
  } catch {
    // 拿不到默认基线时保持空对象——diff 退化为"全部记录"，不阻断提取
  }
  perDoc.set(tag, result);
  return result;
}
