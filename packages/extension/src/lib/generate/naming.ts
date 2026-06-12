import type { CaptureIR } from '../types';

/** 无语义信息的 utility class 词,推断组件名时跳过 */
const UTILITY_WORDS = new Set([
  'flex',
  'grid',
  'block',
  'inline',
  'hidden',
  'relative',
  'absolute',
  'fixed',
  'sticky',
  'static',
]);

/**
 * PascalCase 化:按非字母数字切分、各段首字母大写后拼接;
 * 结果首字符非字母则前缀 C;无有效字符返回空串。
 */
export function pascalCase(input: string): string {
  const joined = input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
  if (joined === '') return '';
  return /^[A-Za-z]/.test(joined) ? joined : `C${joined}`;
}

function isMeaningfulClassToken(token: string): boolean {
  if (token.length < 3) return false;
  if (token.includes('-')) return false;
  if (/^\d+$/.test(token)) return false;
  if (UTILITY_WORDS.has(token.toLowerCase())) return false;
  return true;
}

/**
 * 推断组件名:根节点 data-original-class 首个有意义词
 * > aria-label 首个有意义英文词 > pageTitle 首个英文词 > 根 tag;
 * 兜底 ClonedComponent。
 */
export function inferComponentName(ir: CaptureIR): string {
  const originalClass = ir.root.attrs['data-original-class'] ?? '';
  const classToken = originalClass
    .split(/\s+/)
    .filter(Boolean)
    .find(isMeaningfulClassToken);
  const ariaLabel = ir.root.attrs['aria-label'] ?? '';
  const ariaWord = (ariaLabel.match(/[A-Za-z]+/g) ?? []).find(
    isMeaningfulClassToken,
  );
  const titleWord = ir.pageTitle.match(/[A-Za-z]{3,}/)?.[0];
  const candidate = classToken ?? ariaWord ?? titleWord ?? ir.root.tag;
  return pascalCase(candidate) || 'ClonedComponent';
}
