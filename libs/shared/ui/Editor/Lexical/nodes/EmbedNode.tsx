"use client";
import { DecoratorNode, type NodeKey } from "lexical";
import type { JSX } from "react";
import type { EmbedProviderType } from "../embed";
import { EmbedComponent } from "./EmbedComponent";
import {
  $createEmbedNode,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  type EmbedPayload,
  type SerializedEmbedNode,
} from "./embedNode.util";
import type { MediaAlign } from "./shared.type";

export class EmbedNode extends DecoratorNode<JSX.Element> {
  __url: string;
  __embedUrl: string;
  __provider?: EmbedProviderType;
  __width: number;
  __height: number;
  __align: MediaAlign;

  static override getType(): string {
    return "akan-embed";
  }

  static override clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(
      {
        url: node.__url,
        embedUrl: node.__embedUrl,
        provider: node.__provider,
        width: node.__width,
        height: node.__height,
        align: node.__align,
      },
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedEmbedNode): EmbedNode {
    return $createEmbedNode(serialized);
  }

  constructor(payload: EmbedPayload, key?: NodeKey) {
    super(key);
    this.__url = payload.url ?? "";
    this.__embedUrl = payload.embedUrl ?? "";
    this.__provider = payload.provider;
    this.__width = payload.width ?? DEFAULT_WIDTH;
    this.__height = payload.height ?? DEFAULT_HEIGHT;
    this.__align = payload.align ?? "center";
  }

  override exportJSON(): SerializedEmbedNode {
    return {
      ...super.exportJSON(),
      type: "akan-embed",
      version: 1,
      url: this.__url,
      embedUrl: this.__embedUrl,
      provider: this.__provider,
      width: this.__width,
      height: this.__height,
      align: this.__align,
    };
  }

  override createDOM(): HTMLElement {
    // A bare block host; all visuals live in the decorate() component.
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

  setSize(width: number, height: number): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  setSource(url: string, embedUrl: string, provider: EmbedProviderType): void {
    const writable = this.getWritable();
    writable.__url = url;
    writable.__embedUrl = embedUrl;
    writable.__provider = provider;
  }

  override decorate(): JSX.Element {
    return (
      <EmbedComponent
        nodeKey={this.getKey()}
        embedUrl={this.__embedUrl}
        provider={this.__provider}
        width={this.__width}
        height={this.__height}
        align={this.__align}
      />
    );
  }
}
