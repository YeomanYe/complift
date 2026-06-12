import type { CaptureIR, GeneratedFiles, IRNode, IRText } from '../types';
import { inferComponentName, pascalCase } from './naming';

const VOID_ELEMENTS = new Set([
  'img',
  'br',
  'hr',
  'input',
  'meta',
  'link',
  'source',
  'area',
  'base',
  'col',
  'embed',
  'track',
  'wbr',
]);

const BOOLEAN_ATTRS = new Set([
  'disabled',
  'checked',
  'readonly',
  'required',
  'autofocus',
  'hidden',
  'multiple',
  'selected',
]);

/** HTML 属性 → JSX 属性映射 */
const HTML_ATTR_MAP: Record<string, string> = {
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  autocomplete: 'autoComplete',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  srcset: 'srcSet',
  crossorigin: 'crossOrigin',
  'xlink:href': 'xlinkHref',
};

/** svg 常用 kebab 属性,统一 camelCase 化(viewBox 等本就 camel 的原样保留) */
const SVG_KEBAB_ATTRS = [
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'stroke-opacity',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'clip-path',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'letter-spacing',
  'word-spacing',
  'marker-start',
  'marker-mid',
  'marker-end',
  'stop-color',
  'stop-opacity',
  'flood-color',
  'flood-opacity',
  'color-interpolation',
  'color-interpolation-filters',
  'shape-rendering',
  'text-rendering',
  'image-rendering',
  'vector-effect',
  'transform-origin',
  'paint-order',
  'lighting-color',
];

const SVG_ATTR_MAP: Record<string, string> = Object.fromEntries(
  SVG_KEBAB_ATTRS.map((attr) => [
    attr,
    attr.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase()),
  ]),
);

function isText(child: IRNode | IRText): child is IRText {
  return 'text' in child;
}

/** styles 排序后序列化,作为类共享判定的 key */
function styleKey(styles: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(styles).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

interface CssClass {
  name: string;
  styles: Record<string, string>;
}

/** DFS 序分配 cl-N;styles 完全相同(非空)的节点共享同一类 */
function assignClasses(root: IRNode): {
  classes: CssClass[];
  classOf: Map<IRNode, string>;
} {
  const classes: CssClass[] = [];
  const byKey = new Map<string, string>();
  const classOf = new Map<IRNode, string>();
  const walk = (node: IRNode): void => {
    if (Object.keys(node.styles).length > 0) {
      const key = styleKey(node.styles);
      let name = byKey.get(key);
      if (name === undefined) {
        name = `cl-${classes.length + 1}`;
        byKey.set(key, name);
        classes.push({ name, styles: node.styles });
      }
      classOf.set(node, name);
    }
    for (const child of node.children) {
      if (!isText(child)) walk(child);
    }
  };
  walk(root);
  return { classes, classOf };
}

/** 连续空白 collapse 为单空格;纯空白返回 null(丢弃) */
function collapseText(text: string): string | null {
  const collapsed = text.replace(/\s+/g, ' ');
  return collapsed === '' || collapsed === ' ' ? null : collapsed;
}

/** 文本段渲染:含 { } < > 用 {'…'} 包裹并转义 \ 与 ' */
function renderText(text: string): string {
  if (!/[{}<>]/.test(text)) return text;
  const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `{'${escaped}'}`;
}

function renderAttrValue(name: string, value: string): string {
  if (value.includes('"')) {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return `${name}={'${escaped}'}`;
  }
  return `${name}="${value}"`;
}

function buildAttrParts(node: IRNode, className: string | undefined): string[] {
  const parts: string[] = [];
  if (className !== undefined) parts.push(`className="${className}"`);
  const isInput = node.tag === 'input';
  for (const [key, value] of Object.entries(node.attrs)) {
    if (key === 'data-original-class' || key === 'class') continue;
    if (key === 'checked' && isInput) {
      parts.push('defaultChecked');
      continue;
    }
    if (BOOLEAN_ATTRS.has(key) && (value === '' || value.toLowerCase() === key)) {
      parts.push(HTML_ATTR_MAP[key] ?? key);
      continue;
    }
    if (key === 'value' && isInput) {
      parts.push(renderAttrValue('defaultValue', value));
      continue;
    }
    const name = HTML_ATTR_MAP[key] ?? SVG_ATTR_MAP[key] ?? key;
    parts.push(renderAttrValue(name, value));
  }
  return parts;
}

const ROOT_INDENT = 4;
const INDENT_STEP = 2;

function renderNode(
  node: IRNode,
  depth: number,
  classOf: Map<IRNode, string>,
): string[] {
  const pad = ' '.repeat(ROOT_INDENT + depth * INDENT_STEP);
  const parts = buildAttrParts(node, classOf.get(node));
  const attrStr = parts.length > 0 ? ` ${parts.join(' ')}` : '';
  if (VOID_ELEMENTS.has(node.tag)) {
    return [`${pad}<${node.tag}${attrStr} />`];
  }
  const kids: (IRNode | string)[] = [];
  for (const child of node.children) {
    if (isText(child)) {
      const collapsed = collapseText(child.text);
      if (collapsed !== null) kids.push(collapsed);
    } else {
      kids.push(child);
    }
  }
  const open = `${pad}<${node.tag}${attrStr}>`;
  const close = `</${node.tag}>`;
  if (kids.length === 0) {
    return [`${open}${close}`];
  }
  if (kids.every((kid) => typeof kid === 'string')) {
    return [`${open}${kids.map(renderText).join('')}${close}`];
  }
  const childPad = ' '.repeat(ROOT_INDENT + (depth + 1) * INDENT_STEP);
  const lines: string[] = [open];
  for (const kid of kids) {
    if (typeof kid === 'string') {
      lines.push(`${childPad}${renderText(kid.trim())}`);
    } else {
      lines.push(...renderNode(kid, depth + 1, classOf));
    }
  }
  lines.push(`${pad}${close}`);
  return lines;
}

function renderCss(classes: CssClass[]): string {
  if (classes.length === 0) return '';
  const blocks = classes.map(({ name, styles }) => {
    const props = Object.entries(styles)
      .map(([prop, value]) => `  ${prop}: ${value};`)
      .join('\n');
    return `.${name} {\n${props}\n}`;
  });
  return `${blocks.join('\n\n')}\n`;
}

/** 确定性 IR → TSX/CSS 生成:同输入必同输出 */
export function generate(ir: CaptureIR, hint?: { name?: string }): GeneratedFiles {
  const componentName =
    hint?.name !== undefined
      ? pascalCase(hint.name) || 'ClonedComponent'
      : inferComponentName(ir);
  const { classes, classOf } = assignClasses(ir.root);
  const jsx = renderNode(ir.root, 0, classOf).join('\n');
  const tsx = `import './${componentName}.css';

export function ${componentName}() {
  return (
${jsx}
  );
}

export default ${componentName};
`;
  return { tsx, css: renderCss(classes), componentName };
}
