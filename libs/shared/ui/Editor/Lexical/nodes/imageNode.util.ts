import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { ImageNode } from "./ImageNode";
import type { ImageFit, MediaAlign } from "./shared.type";

export interface ImagePayload {
  /** Backing `cnst.File` id — collected for attachment reconcile. Absent for external images. */
  fileId?: string;
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  align?: MediaAlign;
  fit?: ImageFit;
  bgColor?: string;
  key?: NodeKey;
}

export type SerializedImageNode = Spread<
  {
    fileId?: string;
    src: string;
    alt: string;
    width: number;
    height: number;
    align: MediaAlign;
    fit: ImageFit;
    bgColor?: string;
  },
  SerializedLexicalNode
>;

export const $createImageNode = (payload: ImagePayload): ImageNode => $applyNodeReplacement(new ImageNode(payload));

export const $isImageNode = (node: LexicalNode | null | undefined): node is ImageNode => node instanceof ImageNode;
