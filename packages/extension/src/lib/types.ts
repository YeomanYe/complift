export interface ClonedComponent {
  id: string;                 // crypto.randomUUID()
  name: string;               // PascalCase, 生成器推断,可改
  sourceUrl: string;
  sourceSelector: string;     // 捕获时 CSS path
  capturedAt: number;         // epoch ms
  width: number;
  height: number;
  headVersionId: string;
}
export interface ComponentVersion {
  id: string;
  componentId: string;
  seq: number;                // 1..N 单调递增
  parentId: string | null;
  author: 'capture' | 'manual' | 'agent' | 'rollback';
  message: string;
  createdAt: number;
  files: { tsx: string; css: string };
}
export interface CaptureIR {
  root: IRNode;
  baseUrl: string;
  pageTitle: string;
  viewport: { width: number; height: number };
  rect: { width: number; height: number };
}
export interface IRNode {
  tag: string;
  attrs: Record<string, string>;
  styles: Record<string, string>;
  children: (IRNode | IRText)[];
}
export interface IRText { text: string }
export interface GeneratedFiles { tsx: string; css: string; componentName: string }
