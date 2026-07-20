"use client";
import { DecoratorNode, type DOMExportOutput, type NodeKey } from "lexical";
import type { JSX } from "react";
import { ImageComponent } from "./ImageComponent";
import { $createImageNode, type ImagePayload, type SerializedImageNode } from "./imageNode.util";
import type { ImageFit, MediaAlign } from "./shared.type";

export class ImageNode extends DecoratorNode<JSX.Element> {
  __fileId?: string;
  __src: string;
  __alt: string;
  __width: number;
  __height: number;
  __align: MediaAlign;
  __fit: ImageFit;
  __bgColor?: string;

  static override getType(): string {
    return "akan-image";
  }

  static override clone(node: ImageNode): ImageNode {
    return new ImageNode(
      {
        fileId: node.__fileId,
        src: node.__src,
        alt: node.__alt,
        width: node.__width,
        height: node.__height,
        align: node.__align,
        fit: node.__fit,
        bgColor: node.__bgColor,
      },
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedImageNode): ImageNode {
    return $createImageNode(serialized);
  }

  constructor(payload: ImagePayload, key?: NodeKey) {
    super(key);
    this.__fileId = payload.fileId;
    this.__src = payload.src;
    this.__alt = payload.alt ?? "";
    this.__width = payload.width ?? 0;
    this.__height = payload.height ?? 0;
    this.__align = payload.align ?? "center";
    this.__fit = payload.fit ?? "contain";
    this.__bgColor = payload.bgColor;
  }

  override exportJSON(): SerializedImageNode {
    return {
      ...super.exportJSON(),
      type: "akan-image",
      version: 1,
      fileId: this.__fileId,
      src: this.__src,
      alt: this.__alt,
      width: this.__width,
      height: this.__height,
      align: this.__align,
      fit: this.__fit,
      bgColor: this.__bgColor,
    };
  }

  override exportDOM(): DOMExportOutput {
    const img = document.createElement("img");
    img.setAttribute("src", this.__src);
    img.setAttribute("alt", this.__alt);
    if (this.__width) img.setAttribute("width", String(this.__width));
    if (this.__height) img.setAttribute("height", String(this.__height));
    return { element: img };
  }

  override createDOM(): HTMLElement {
    // A bare block host; all visuals live in the decorate() component (MediaFrame).
    return document.createElement("div");
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): false {
    return false;
  }

  setAlign(align: MediaAlign): void {
    this.getWritable().__align = align;
  }

  setFit(fit: ImageFit): void {
    this.getWritable().__fit = fit;
  }

  setSize(width: number, height: number): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  override decorate(): JSX.Element {
    return (
      <ImageComponent
        nodeKey={this.getKey()}
        src={this.__src}
        alt={this.__alt}
        width={this.__width}
        height={this.__height}
        align={this.__align}
        fit={this.__fit}
        bgColor={this.__bgColor}
      />
    );
  }
}
