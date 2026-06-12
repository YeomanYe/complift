import { describe, expect, it } from 'vitest';
import type { CaptureIR, IRNode, IRText } from '../types';
import { generate } from './generator';

function el(
  tag: string,
  attrs: Record<string, string> = {},
  styles: Record<string, string> = {},
  children: (IRNode | IRText)[] = [],
): IRNode {
  return { tag, attrs, styles, children };
}

function makeIR(root: IRNode, extra: Partial<CaptureIR> = {}): CaptureIR {
  return {
    root,
    baseUrl: 'https://example.com/',
    pageTitle: 'Example Page',
    viewport: { width: 1280, height: 800 },
    rect: { width: 320, height: 200 },
    ...extra,
  };
}

describe('generate', () => {
  it('单个带样式 div 生成精确的 tsx 与 css 字符串', () => {
    const ir = makeIR(
      el('div', {}, { display: 'flex', color: 'rgb(255, 0, 0)' }, [
        { text: 'Hello' },
      ]),
    );
    const out = generate(ir, { name: 'Hero' });
    expect(out.componentName).toBe('Hero');
    expect(out.tsx).toBe(`import './Hero.css';

export function Hero() {
  return (
    <div className="cl-1">Hello</div>
  );
}

export default Hero;
`);
    expect(out.css).toBe(`.cl-1 {
  display: flex;
  color: rgb(255, 0, 0);
}
`);
  });

  it('styles 完全相同的两个节点共享同一个类,CSS 只输出一次', () => {
    const ir = makeIR(
      el('div', {}, { padding: '8px' }, [
        el('span', {}, { color: 'blue' }, [{ text: 'a' }]),
        el('span', {}, { color: 'blue' }, [{ text: 'b' }]),
      ]),
    );
    const out = generate(ir, { name: 'Card' });
    expect(out.tsx).toContain('<span className="cl-2">a</span>');
    expect(out.tsx).toContain('<span className="cl-2">b</span>');
    expect(out.tsx).not.toContain('cl-3');
    expect(out.css.match(/\.cl-2 \{/g)).toHaveLength(1);
  });

  it('styles 为空的节点不输出 className', () => {
    const ir = makeIR(
      el('div', {}, {}, [el('span', {}, { color: 'blue' }, [{ text: 'x' }])]),
    );
    const out = generate(ir, { name: 'Card' });
    expect(out.tsx).toContain('<div>');
    expect(out.tsx).toContain('<span className="cl-1">x</span>');
  });

  it('svg kebab 属性映射为 camelCase,viewBox 原样保留', () => {
    const ir = makeIR(
      el('svg', { viewBox: '0 0 24 24' }, {}, [
        el('path', {
          d: 'M0 0L10 10',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'fill-rule': 'evenodd',
        }),
      ]),
    );
    const out = generate(ir, { name: 'Icon' });
    expect(out.tsx).toContain('viewBox="0 0 24 24"');
    expect(out.tsx).toContain('strokeWidth="2"');
    expect(out.tsx).toContain('strokeLinecap="round"');
    expect(out.tsx).toContain('fillRule="evenodd"');
    expect(out.tsx).not.toContain('stroke-width');
  });

  it('xlink:href 映射为 xlinkHref', () => {
    const ir = makeIR(
      el('svg', {}, {}, [el('use', { 'xlink:href': '#icon' })]),
    );
    const out = generate(ir, { name: 'Icon' });
    expect(out.tsx).toContain('xlinkHref="#icon"');
  });

  it('for 属性映射为 htmlFor,tabindex 映射为 tabIndex', () => {
    const ir = makeIR(
      el('label', { for: 'email', tabindex: '0' }, {}, [{ text: 'Email' }]),
    );
    const out = generate(ir, { name: 'Field' });
    expect(out.tsx).toContain('htmlFor="email"');
    expect(out.tsx).toContain('tabIndex="0"');
  });

  it('文本含 {} <> 时用 {\'…\'} 包裹并转义单引号', () => {
    const ir = makeIR(
      el('div', {}, {}, [{ text: "it's {count} <b>" }]),
    );
    const out = generate(ir, { name: 'Msg' });
    expect(out.tsx).toContain("<div>{'it\\'s {count} <b>'}</div>");
  });

  it('纯空白文本丢弃,连续空白 collapse 为单空格', () => {
    const ir = makeIR(
      el('div', {}, {}, [
        el('p', {}, {}, [{ text: '\n   ' }]),
        el('p', {}, {}, [{ text: 'Hi\n   there' }]),
      ]),
    );
    const out = generate(ir, { name: 'Txt' });
    expect(out.tsx).toContain('<p></p>');
    expect(out.tsx).toContain('<p>Hi there</p>');
  });

  it('同一 IR 调用两次输出完全一致(确定性)', () => {
    const ir = makeIR(
      el('div', { 'data-original-class': 'hero' }, { margin: '0' }, [
        el('span', {}, { color: 'red' }, [{ text: 'x' }]),
      ]),
    );
    const a = generate(ir);
    const b = generate(structuredClone(ir));
    expect(a.tsx).toBe(b.tsx);
    expect(a.css).toBe(b.css);
    expect(a.componentName).toBe(b.componentName);
  });

  it('嵌套结构按每层 2 空格精确缩进', () => {
    const ir = makeIR(
      el('div', {}, { padding: '4px' }, [
        el('ul', {}, { margin: '0' }, [
          el('li', {}, {}, [{ text: 'one' }]),
        ]),
      ]),
    );
    const out = generate(ir, { name: 'List' });
    expect(out.tsx).toBe(`import './List.css';

export function List() {
  return (
    <div className="cl-1">
      <ul className="cl-2">
        <li>one</li>
      </ul>
    </div>
  );
}

export default List;
`);
  });

  it('void 元素自闭合输出', () => {
    const ir = makeIR(
      el('div', {}, {}, [el('img', { src: 'a.png', alt: '' }), el('br')]),
    );
    const out = generate(ir, { name: 'Pic' });
    expect(out.tsx).toContain('<img src="a.png" alt="" />');
    expect(out.tsx).toContain('<br />');
  });

  it('布尔属性输出无值形式,input 的 checked/value 转 defaultChecked/defaultValue', () => {
    const ir = makeIR(
      el('form', {}, {}, [
        el('input', { type: 'checkbox', checked: '' }),
        el('input', { type: 'text', value: 'abc', readonly: 'readonly', required: '' }),
      ]),
    );
    const out = generate(ir, { name: 'Form' });
    expect(out.tsx).toContain('<input type="checkbox" defaultChecked />');
    expect(out.tsx).toContain(
      '<input type="text" defaultValue="abc" readOnly required />',
    );
  });

  it('data-original-class 丢弃,data-complift-truncated 原样保留', () => {
    const ir = makeIR(
      el('div', {
        'data-original-class': 'btn btn-primary',
        'data-complift-truncated': 'true',
      }),
    );
    const out = generate(ir, { name: 'Btn' });
    expect(out.tsx).not.toContain('data-original-class');
    expect(out.tsx).toContain('data-complift-truncated="true"');
  });

  it('hint.name 优先并 PascalCase 化,决定 css import 路径', () => {
    const ir = makeIR(el('div', { 'data-original-class': 'card' }));
    const out = generate(ir, { name: 'my widget' });
    expect(out.componentName).toBe('MyWidget');
    expect(out.tsx).toContain("import './MyWidget.css';");
    expect(out.tsx).toContain('export function MyWidget()');
    expect(out.tsx).toContain('export default MyWidget;');
  });

  it('无 hint 时从根节点 data-original-class 推断组件名', () => {
    const ir = makeIR(el('div', { 'data-original-class': 'px-4 hero' }));
    const out = generate(ir);
    expect(out.componentName).toBe('Hero');
  });
});
