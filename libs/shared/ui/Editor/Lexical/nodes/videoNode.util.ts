import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { MediaAlign } from "./shared.type";
import { VideoNode } from "./VideoNode";

export interface VideoPayload {
  fileId?: string;
  src: string;
  poster?: string;
  width?: number;
  height?: number;
  align?: MediaAlign;
  key?: NodeKey;
}

export type SerializedVideoNode = Spread<
  {
    fileId?: string;
    src: string;
    poster?: string;
    width: number;
    height: number;
    align: MediaAlign;
  },
  SerializedLexicalNode
>;

export const RESET_WIDTH = 650;

export const $createVideoNode = (payload: VideoPayload): VideoNode => $applyNodeReplacement(new VideoNode(payload));

export const $isVideoNode = (node: LexicalNode | null | undefined): node is VideoNode => node instanceof VideoNode;
