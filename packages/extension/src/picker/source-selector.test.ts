import { afterEach, describe, expect, it } from 'vitest';
import { computeSourceSelector } from './source-selector';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('computeSourceSelector', () => {
  it('元素有 id 时直接返回 #id', () => {
    document.body.innerHTML = '<div><p id="hero">x</p></div>';
    const el = document.getElementById('hero');
    expect(computeSourceSelector(el as Element)).toBe('#hero');
  });

  it('无 id 时返回从 body 向下的 nth-of-type 路径', () => {
    document.body.innerHTML =
      '<div>a</div><div><section><span></span><div></div><div></div><div class="t"></div></section></div>';
    const el = document.querySelector('.t');
    expect(computeSourceSelector(el as Element)).toBe(
      'body>div:nth-of-type(2)>section:nth-of-type(1)>div:nth-of-type(3)',
    );
  });

  it('nth-of-type 只数同 tag 的前序兄弟', () => {
    document.body.innerHTML = '<span></span><p></p><span class="t"></span>';
    const el = document.querySelector('.t');
    expect(computeSourceSelector(el as Element)).toBe('body>span:nth-of-type(2)');
  });

  it('选择器锚定 body：更早子树里的同形链（诱饵）不会被命中', () => {
    // 诱饵：body 第一个子树里嵌套了同形链 div:nth-of-type(2)>section:nth-of-type(1)>p:nth-of-type(1)
    document.body.innerHTML =
      '<div><div></div><div><section><p class="decoy"></p></section></div></div>' +
      '<div><section><p class="target"></p></section></div>';
    const el = document.querySelector('.target') as Element;
    const decoy = document.querySelector('.decoy') as Element;
    const selector = computeSourceSelector(el);
    const found = document.querySelector(selector);
    expect(found).not.toBe(decoy);
    expect(found).toBe(el);
  });

  it('生成的选择器能用 querySelector 找回原元素', () => {
    document.body.innerHTML =
      '<div><ul><li></li><li><a class="t">x</a></li></ul></div>';
    const el = document.querySelector('.t') as Element;
    const selector = computeSourceSelector(el);
    expect(document.querySelector(selector)).toBe(el);
  });
});
