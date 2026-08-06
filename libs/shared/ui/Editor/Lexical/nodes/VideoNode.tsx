"use client";
import { DecoratorNode, type NodeKey } from "lexical";
import type { JSX } from "react";
import type { MediaAlign } from "./shared.type";
import { VideoComponent } from "./VideoComponent";
import { $createVideoNode, type SerializedVideoNode, type VideoPayload } from "./videoNode.util";

export class VideoNode extends DecoratorNode<JSX.Element> {
  __fileId?: string;
  __src: string;
  __poster?: string;
  __width: number;
  __height: number;
  __align: MediaAlign;

  static override getType(): string {
    return "akan-video";
  }

  static override clone(node: VideoNode): VideoNode {
    return new VideoNode(
      {
        fileId: node.__fileId,
        src: node.__src,
        poster: node.__poster,
        width: node.__width,
        height: node.__height,
        align: node.__align,
      },
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedVideoNode): VideoNode {
    return $createVideoNode(serialized);
  }

  constructor(payload: VideoPayload, key?: NodeKey) {
    super(key);
    this.__fileId = payload.fileId;
    this.__src = payload.src;
    this.__poster = payload.poster;
    this.__width = payload.width ?? 0;
    this.__height = payload.height ?? 0;
    this.__align = payload.align ?? "center";
  }

  override exportJSON(): SerializedVideoNode {
    return {
      ...super.exportJSON(),
      type: "akan-video",
      version: 1,
      fileId: this.__fileId,
      src: this.__src,
      poster: this.__poster,
      width: this.__width,
      height: this.__height,
      align: this.__align,
    };
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

  setSize(width: number, height: number): void {
    const writable = this.getWritable();
    writable.__width = width;
    writable.__height = height;
  }

  override decorate(): JSX.Element {
    return (
      <VideoComponent
        nodeKey={this.getKey()}
        src={this.__src}
        poster={this.__poster}
        width={this.__width}
        height={this.__height}
        align={this.__align}
      />
    );
  }
}
