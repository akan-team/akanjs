"use client";
import { DecoratorNode, type NodeKey } from "lexical";
import type { JSX } from "react";
import { MermaidComponent } from "./MermaidComponent";
import { $createMermaidNode, type MermaidPayload, type SerializedMermaidNode } from "./mermaidNode.util";
import type { MediaAlign } from "./shared.type";

/**
 * Mermaid diagram block. Stores only the diagram source; the SVG is rendered on
 * the client at mount, so a diagram always follows the current light/dark theme
 * instead of freezing a snapshot into the document. Presentation mirrors
 * Excalidraw — a bare figure with the shared `MediaFrame` chrome (align / edit /
 * reset-size / delete plus left/right resize handles) and a full-screen source
 * editor with live preview.
 */
export class MermaidNode extends DecoratorNode<JSX.Element> {
  __code: string;
  __width: number;
  __align: MediaAlign;

  static override getType(): string {
    return "akan-mermaid";
  }

  static override clone(node: MermaidNode): MermaidNode {
    return new MermaidNode({ code: node.__code, width: node.__width, align: node.__align }, node.__key);
  }

  static override importJSON(serialized: SerializedMermaidNode): MermaidNode {
    return $createMermaidNode(serialized);
  }

  constructor(payload: MermaidPayload, key?: NodeKey) {
    super(key);
    this.__code = payload.code ?? "";
    this.__width = payload.width ?? 0;
    this.__align = payload.align ?? "center";
  }

  override exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      type: "akan-mermaid",
      version: 1,
      code: this.__code,
      width: this.__width,
      align: this.__align,
    };
  }

  override createDOM(): HTMLElement {
    // Block host; the diagram/controls live in the decorate() component.
    return document.createElement("div");
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): false {
    return false;
  }

  getCode(): string {
    return this.getLatest().__code;
  }

  setCode(code: string): void {
    this.getWritable().__code = code;
  }

  setWidth(width: number): void {
    this.getWritable().__width = width;
  }

  setAlign(align: MediaAlign): void {
    this.getWritable().__align = align;
  }

  override decorate(): JSX.Element {
    return <MermaidComponent nodeKey={this.getKey()} code={this.__code} width={this.__width} align={this.__align} />;
  }
}
