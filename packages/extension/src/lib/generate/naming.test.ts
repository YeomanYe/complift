import { describe, expect, it } from 'vitest';
import type { CaptureIR, IRNode } from '../types';
import { inferComponentName } from './naming';

function makeIR(root: IRNode, pageTitle = 'Example Page'): CaptureIR {
  return {
    root,
    baseUrl: 'https://example.com/',
    pageTitle,
    viewport: { width: 1280, height: 800 },
    rect: { width: 320, height: 200 },
  };
}

function el(tag: string, attrs: Record<string, string> = {}): IRNode {
  return { tag, attrs, styles: {}, children: [] };
}

describe('inferComponentName', () => {
  it('取根节点 data-original-class 首个有意义词并 PascalCase 化', () => {
    const ir = makeIR(
      el('div', { 'data-original-class': 'px-4 mt-2 hero shadow' }),
    );
    expect(inferComponentName(ir)).toBe('Hero');
  });

  it('跳过带连字符、纯数字、长度<3 与 utility 词的 class token', () => {
    const ir = makeIR(
      el('div', { 'data-original-class': 'flex 42 ab card-list btn' }),
    );
    expect(inferComponentName(ir)).toBe('Btn');
  });

  it('class 无可用词时取 pageTitle 首个英文词', () => {
    const ir = makeIR(el('div', { 'data-original-class': 'px-4' }), 'Acme Dashboard - Home');
    expect(inferComponentName(ir)).toBe('Acme');
  });

  it('class 无可用词时优先取 aria-label 首个有意义英文词,先于 pageTitle', () => {
    const ir = makeIR(
      el('div', { 'data-original-class': 'px-4', 'aria-label': 'User profile card' }),
      'Acme Dashboard - Home',
    );
    expect(inferComponentName(ir)).toBe('User');
  });

  it('aria-label 跳过短词与 utility 词', () => {
    const ir = makeIR(
      el('div', { 'aria-label': 'Go to flex hero section' }),
      'Acme Dashboard',
    );
    expect(inferComponentName(ir)).toBe('Hero');
  });

  it('aria-label 无可用英文词时回退到 pageTitle', () => {
    const ir = makeIR(
      el('div', { 'aria-label': '关闭' }),
      'Acme Dashboard',
    );
    expect(inferComponentName(ir)).toBe('Acme');
  });

  it('pageTitle 无英文词时回退到根 tag', () => {
    const ir = makeIR(el('section'), '中文标题');
    expect(inferComponentName(ir)).toBe('Section');
  });

  it('全部不可用时兜底 ClonedComponent', () => {
    const ir = makeIR(el(''), '');
    expect(inferComponentName(ir)).toBe('ClonedComponent');
  });

  it('首字符非字母时前缀 C', () => {
    const ir = makeIR(el('div', { 'data-original-class': '4cols' }), '');
    expect(inferComponentName(ir)).toBe('C4cols');
  });
});
