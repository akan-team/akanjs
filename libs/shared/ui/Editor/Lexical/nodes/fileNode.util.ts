import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { FileNode } from "./FileNode";

export interface FilePayload {
  fileId?: string;
  src: string;
  name: string;
  size?: number;
  format?: string;
  key?: NodeKey;
}

export type SerializedFileNode = Spread<
  {
    fileId?: string;
    src: string;
    name: string;
    size?: number;
    format?: string;
  },
  SerializedLexicalNode
>;

/** Human-readable byte size, mirroring `cnst.File`'s formatting. */
export const formatSize = (size?: number): string | null => {
  if (!size || size < 0) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

export const $createFileNode = (payload: FilePayload): FileNode => $applyNodeReplacement(new FileNode(payload));

export const $isFileNode = (node: LexicalNode | null | undefined): node is FileNode => node instanceof FileNode;
