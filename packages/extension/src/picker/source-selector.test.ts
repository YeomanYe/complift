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
      'div:nth-of-type(2)>section:nth-of-type(1)>div:nth-of-type(3)',
    );
  });

  it('nth-of-type 只数同 tag 的前序兄弟', () => {
    document.body.innerHTML = '<span></span><p></p><span class="t"></span>';
    const el = document.querySelector('.t');
    expect(computeSourceSelector(el as Element)).toBe('span:nth-of-type(2)');
  });

  it('生成的选择器能用 querySelector 找回原元素', () => {
    document.body.innerHTML =
      '<div><ul><li></li><li><a class="t">x</a></li></ul></div>';
    const el = document.querySelector('.t') as Element;
    const selector = computeSourceSelector(el);
    expect(document.querySelector(selector)).toBe(el);
  });
});
