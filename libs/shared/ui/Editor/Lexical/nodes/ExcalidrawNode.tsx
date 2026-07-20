"use client";
import { DecoratorNode, type NodeKey } from "lexical";
import type { JSX } from "react";
import { ExcalidrawComponent } from "./ExcalidrawComponent";
import {
  $createExcalidrawNode,
  createEmptyExcalidrawScene,
  type ExcalidrawPayload,
  type ExcalidrawScene,
  type SerializedExcalidrawNode,
} from "./excalidrawNode.util";
import type { MediaAlign } from "./shared.type";

/**
 * Excalidraw drawing block. Renders like an image — the drawing's SVG snapshot
 * shown bare (no card chrome), with a floating action menu (align / edit /
 * reset-drawing / reset-size / delete) and left/right resize handles supplied by
 * the shared `MediaFrame`. Width is stored on the node; height follows the SVG's
 * intrinsic aspect ratio. Editing happens in a full-screen modal.
 */
export class ExcalidrawNode extends DecoratorNode<JSX.Element> {
  __scene: ExcalidrawScene;
  __preview: string | null;
  __width: number;
  __align: MediaAlign;

  static override getType(): string {
    return "akan-excalidraw";
  }

  static override clone(node: ExcalidrawNode): ExcalidrawNode {
    return new ExcalidrawNode(
      { scene: node.__scene, preview: node.__preview, width: node.__width, align: node.__align },
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedExcalidrawNode): ExcalidrawNode {
    return $createExcalidrawNode(serialized);
  }

  constructor(payload: ExcalidrawPayload, key?: NodeKey) {
    super(key);
    this.__scene = payload.scene ?? createEmptyExcalidrawScene();
    this.__preview = payload.preview ?? null;
    this.__width = payload.width ?? 0;
    this.__align = payload.align ?? "center";
  }

  override exportJSON(): SerializedExcalidrawNode {
    return {
      ...super.exportJSON(),
      type: "akan-excalidraw",
      version: 1,
      scene: this.__scene,
      preview: this.__preview,
      width: this.__width,
      align: this.__align,
    };
  }

  override createDOM(): HTMLElement {
    // Block host; the drawing/controls live in the decorate() component.
    return document.createElement("div");
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): false {
    return false;
  }

  setScene(scene: ExcalidrawScene): void {
    this.getWritable().__scene = scene;
  }

  setPreview(preview: string | null): void {
    this.getWritable().__preview = preview;
  }

  setWidth(width: number): void {
    this.getWritable().__width = width;
  }

  setAlign(align: MediaAlign): void {
    this.getWritable().__align = align;
  }

  override decorate(): JSX.Element {
    return (
      <ExcalidrawComponent
        nodeKey={this.getKey()}
        scene={this.__scene}
        preview={this.__preview}
        width={this.__width}
        align={this.__align}
      />
    );
  }
}
