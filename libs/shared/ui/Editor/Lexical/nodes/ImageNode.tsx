"use client";
import { RichUrl } from "@libs/shared/common";
import type { DOMConversionMap, DOMConversionOutput, DOMExportOutput, NodeKey } from "lexical";
import type { JSX } from "react";
import { BlockDecoratorNode } from "./BlockDecoratorNode";
import { ImageComponent } from "./ImageComponent";
import { $createImageNode, type ImagePayload, type SerializedImageNode } from "./imageNode.util";
import type { ImageFit, MediaAlign } from "./shared.type";

export class ImageNode extends BlockDecoratorNode {
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

  // Pasted web HTML keeps its pictures, as long as the source is one a stored document may carry.
  static override importDOM(): DOMConversionMap {
    return { img: () => ({ conversion: ImageNode.#fromImg, priority: 0 }) };
  }

  static #fromImg(dom: HTMLElement): DOMConversionOutput {
    const src = RichUrl.media(dom.getAttribute("src"));
    if (!src) return { node: null };
    const width = Number.parseInt(dom.getAttribute("width") ?? "", 10);
    const height = Number.parseInt(dom.getAttribute("height") ?? "", 10);
    return {
      node: $createImageNode({
        src,
        alt: dom.getAttribute("alt") ?? "",
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
      }),
    };
  }

  constructor(payload: ImagePayload = { src: "" }, key?: NodeKey) {
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
