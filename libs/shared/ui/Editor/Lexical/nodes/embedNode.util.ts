import type { EmbedProvider } from "@libs/shared/common";
import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { EmbedNode } from "./EmbedNode";
import type { MediaAlign } from "./shared.type";

export interface EmbedPayload {
  url?: string;
  embedUrl?: string;
  provider?: EmbedProvider;
  width?: number;
  height?: number;
  align?: MediaAlign;
  key?: NodeKey;
}

export type SerializedEmbedNode = Spread<
  {
    url: string;
    embedUrl: string;
    provider?: EmbedProvider;
    width: number;
    height: number;
    align: MediaAlign;
  },
  SerializedLexicalNode
>;

export const defaultEmbedWidth = 650;
export const defaultEmbedHeight = 400;

export const $createEmbedNode = (payload: EmbedPayload): EmbedNode => $applyNodeReplacement(new EmbedNode(payload));

export const $isEmbedNode = (node: LexicalNode | null | undefined): node is EmbedNode => node instanceof EmbedNode;
