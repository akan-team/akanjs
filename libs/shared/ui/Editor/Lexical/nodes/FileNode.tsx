"use client";
import type { NodeKey } from "lexical";
import type { JSX } from "react";
import { BlockDecoratorNode } from "./BlockDecoratorNode";
import { FileComponent } from "./FileComponent";
import { $createFileNode, type FilePayload, type SerializedFileNode } from "./fileNode.util";

export class FileNode extends BlockDecoratorNode {
  __fileId?: string;
  __src: string;
  __name: string;
  __size?: number;
  __format?: string;

  static override getType(): string {
    return "akan-file";
  }

  static override clone(node: FileNode): FileNode {
    return new FileNode(
      { fileId: node.__fileId, src: node.__src, name: node.__name, size: node.__size, format: node.__format },
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedFileNode): FileNode {
    return $createFileNode(serialized);
  }

  constructor(payload: FilePayload = { src: "", name: "" }, key?: NodeKey) {
    super(key);
    this.__fileId = payload.fileId;
    this.__src = payload.src;
    this.__name = payload.name;
    this.__size = payload.size;
    this.__format = payload.format;
  }

  override exportJSON(): SerializedFileNode {
    return {
      ...super.exportJSON(),
      type: "akan-file",
      version: 1,
      fileId: this.__fileId,
      src: this.__src,
      name: this.__name,
      size: this.__size,
      format: this.__format,
    };
  }

  override decorate(): JSX.Element {
    return (
      <FileComponent
        nodeKey={this.getKey()}
        src={this.__src}
        name={this.__name}
        size={this.__size}
        format={this.__format}
      />
    );
  }
}
