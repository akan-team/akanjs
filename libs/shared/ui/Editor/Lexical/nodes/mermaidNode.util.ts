import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { MermaidNode } from "./MermaidNode";
import type { MediaAlign } from "./shared.type";

export interface MermaidPayload {
  code?: string;
  width?: number;
  align?: MediaAlign;
  key?: NodeKey;
}

export type SerializedMermaidNode = Spread<{ code: string; width: number; align: MediaAlign }, SerializedLexicalNode>;

/** The width (px) a "reset size" restores a diagram to, and the initial cap. */
export const RESET_WIDTH = 650;

/** Seed diagram for a freshly inserted block, so the node renders something on insert. */
export const DEFAULT_MERMAID_CODE = `graph TD
  A[Start] --> B{Ready?}
  B -- Yes --> C[Ship]
  B -- No --> A`;

export interface MermaidRender {
  /** Rendered SVG markup, normalized to scale with its container. */
  svg: string;
  /** Intrinsic size read off the SVG `viewBox` (`0` when it carries none). */
  width: number;
  height: number;
}

// mermaid.render() needs a DOM id unique per call — it mounts a throwaway host
// under that id while measuring. Module-scoped so concurrent editors can't collide.
let renderSeq = 0;

/**
 * Renders `code` to SVG through mermaid, which is imported lazily so the ~1MB
 * bundle only loads for documents that actually contain a diagram. Rejects with
 * mermaid's own parse error when the syntax is invalid.
 */
export const renderMermaid = async (code: string, dark: boolean): Promise<MermaidRender> => {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    fontFamily: "inherit",
    // Without this, a failed parse draws mermaid's own "bomb" error diagram into
    // the throwaway measuring host and leaves it stranded in <body>. With it,
    // mermaid tears the host down and just rethrows, which is what we surface.
    suppressErrorRendering: true,
  });
  renderSeq += 1;
  const { svg } = await mermaid.render(`akan-mermaid-${renderSeq}`, code.trim());

  const template = document.createElement("template");
  template.innerHTML = svg;
  const root = template.content.querySelector("svg");
  if (!root) return { svg, width: 0, height: 0 };
  const [, , width = 0, height = 0] = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  // Mermaid pins an inline `max-width` at the diagram's intrinsic size; left in
  // place it caps the block there and the resize handles become a no-op past it.
  root.removeAttribute("style");
  root.removeAttribute("height");
  root.setAttribute("width", "100%");
  root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return { svg: root.outerHTML, width: Math.round(width), height: Math.round(height) };
};

export const $createMermaidNode = (payload: MermaidPayload = {}): MermaidNode =>
  $applyNodeReplacement(new MermaidNode(payload));

export const $isMermaidNode = (node: LexicalNode | null | undefined): node is MermaidNode =>
  node instanceof MermaidNode;
