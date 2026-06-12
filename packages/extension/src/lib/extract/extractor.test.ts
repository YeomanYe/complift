import { afterEach, describe, expect, it } from 'vitest';
import type { IRNode, IRText } from '../types';
import { extractElement } from './extractor';

const isNode = (c: IRNode | IRText): c is IRNode => 'tag' in c;

/** 挂载 html 片段到 body，返回第一个元素 */
function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const el = host.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error('mount: 需要一个 HTML 元素');
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('extractElement — attrs 清洗', () => {
  it('丢弃 on* 与 style 属性，保留其他属性', () => {
    const el = mount(
      '<div onclick="alert(1)" onmouseover="x()" style="color:red" data-x="1" id="a"></div>',
    );
    const ir = extractElement(el);
    expect(ir.root.attrs['onclick']).toBeUndefined();
    expect(ir.root.attrs['onmouseover']).toBeUndefined();
    expect(ir.root.attrs['style']).toBeUndefined();
    expect(ir.root.attrs['data-x']).toBe('1');
    expect(ir.root.attrs['id']).toBe('a');
  });

  it('class 改存为 data-original-class', () => {
    const el = mount('<div class="card primary"></div>');
    const ir = extractElement(el);
    expect(ir.root.attrs['class']).toBeUndefined();
    expect(ir.root.attrs['data-original-class']).toBe('card primary');
  });

  it('img src 与 a href 相对路径按 baseUrl 绝对化', () => {
    const el = mount('<div><img src="/img/a.png"><a href="page/b.html">x</a></div>');
    const ir = extractElement(el);
    const [img, a] = ir.root.children.filter(isNode);
    expect(img?.tag).toBe('img');
    expect(img?.attrs['src']).toBe(new URL('/img/a.png', document.baseURI).href);
    expect(a?.tag).toBe('a');
    expect(a?.attrs['href']).toBe(new URL('page/b.html', document.baseURI).href);
  });
});

describe('extractElement — 节点丢弃与截断', () => {
  it('script 等危险/无关子节点与注释不进 IR', () => {
    const el = mount(
      '<div><script>1</script><noscript>n</noscript><iframe></iframe><template>t</template><!--c--><span>hi</span></div>',
    );
    const ir = extractElement(el);
    const tags = ir.root.children.filter(isNode).map((c) => c.tag);
    expect(tags).toEqual(['span']);
  });

  it('超过 maxNodes 时截断子节点并在父节点打 data-complift-truncated 标记', () => {
    const el = mount(
      '<div><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>',
    );
    const ir = extractElement(el, { maxNodes: 3 });
    const nodes = ir.root.children.filter(isNode);
    expect(nodes).toHaveLength(2);
    expect(ir.root.attrs['data-complift-truncated']).toBe('true');
  });

  it('未超 maxNodes 时不打截断标记', () => {
    const el = mount('<div><span>1</span></div>');
    const ir = extractElement(el);
    expect(ir.root.attrs['data-complift-truncated']).toBeUndefined();
  });
});

describe('extractElement — 子节点结构', () => {
  it('文本节点与元素节点交错时保持原始顺序', () => {
    const el = mount('<div>before<b>bold</b>after</div>');
    const ir = extractElement(el);
    expect(ir.root.children).toHaveLength(3);
    const [t1, b, t2] = ir.root.children;
    expect(t1).toEqual({ text: 'before' });
    expect(isNode(b!) && b.tag === 'b').toBe(true);
    expect(t2).toEqual({ text: 'after' });
  });

  it('svg 子树原样保留：attrs 不清洗、styles 为空对象', () => {
    const el = mount(
      '<div><svg viewBox="0 0 10 10" class="icon"><path d="M0 0h10" fill="currentColor"/></svg></div>',
    );
    const ir = extractElement(el);
    const svg = ir.root.children.filter(isNode)[0];
    expect(svg?.tag).toBe('svg');
    expect(svg?.attrs['viewBox']).toBe('0 0 10 10');
    // svg 内 class 原样保留，不改名
    expect(svg?.attrs['class']).toBe('icon');
    expect(svg?.styles).toEqual({});
    const path = svg?.children.filter(isNode)[0];
    expect(path?.tag).toBe('path');
    expect(path?.attrs['d']).toBe('M0 0h10');
    expect(path?.attrs['fill']).toBe('currentColor');
    expect(path?.styles).toEqual({});
  });
});

describe('extractElement — 样式 diff', () => {
  it('与同 tag 默认基线不同的属性被记录', () => {
    const el = mount('<div style="display: flex"></div>');
    const ir = extractElement(el);
    expect(ir.root.styles['display']).toBe('flex');
  });

  it('与同 tag 默认基线相同的属性被跳过', () => {
    const el = mount('<div></div>');
    const ir = extractElement(el);
    expect(ir.root.styles['display']).toBeUndefined();
  });
});

describe('extractElement — CaptureIR 元数据', () => {
  it('填充 baseUrl / pageTitle / viewport / rect', () => {
    document.title = 'My Page';
    const el = mount('<div></div>');
    el.getBoundingClientRect = () =>
      // 仅测试需要 width/height，其余字段补零
      ({
        width: 320,
        height: 200,
        top: 0,
        left: 0,
        right: 320,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) satisfies DOMRect;
    const ir = extractElement(el);
    expect(ir.baseUrl).toBe(document.baseURI);
    expect(ir.pageTitle).toBe('My Page');
    expect(ir.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight });
    expect(ir.rect).toEqual({ width: 320, height: 200 });
  });

  it('输出是纯数据，可被 structuredClone', () => {
    const el = mount('<div class="a"><span>t</span><svg><circle r="1"/></svg></div>');
    expect(() => structuredClone(extractElement(el))).not.toThrow();
  });
});
