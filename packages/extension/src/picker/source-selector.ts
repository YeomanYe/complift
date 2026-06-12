/**
 * 捕获时记录元素位置的 CSS 选择器：
 * - 有 id 优先 `#id`
 * - 否则从 body 向下逐级 `tag:nth-of-type(n)`（同 tag 前序兄弟计数），并以 `body>` 锚定
 */
export function computeSourceSelector(el: Element): string {
  if (el.id !== '') {
    // jsdom 无全局 CSS 对象；Chrome content script 里走 CSS.escape
    const escape = globalThis.CSS?.escape ?? ((s: string) => s);
    return `#${escape(el.id)}`;
  }

  const doc = el.ownerDocument;
  const segments: string[] = [];
  let cur: Element | null = el;
  while (cur !== null && cur !== doc.body && cur !== doc.documentElement) {
    segments.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${nthOfType(cur)})`);
    cur = cur.parentElement;
  }
  // 锚定 body：未锚定的复合选择器会被 document.querySelector 命中文档里
  // 更早出现的同形子树（诱饵），导致定位到错误元素
  return ['body', ...segments].join('>');
}

function nthOfType(el: Element): number {
  let n = 1;
  let sib = el.previousElementSibling;
  while (sib !== null) {
    if (sib.tagName === el.tagName) n += 1;
    sib = sib.previousElementSibling;
  }
  return n;
}
