import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import type { EmbedProviderType } from "../embed";
import { EmbedNode } from "./EmbedNode";
import type { MediaAlign } from "./shared.type";

export interface EmbedPayload {
  url?: string;
  embedUrl?: string;
  provider?: EmbedProviderType;
  width?: number;
  height?: number;
  align?: MediaAlign;
  key?: NodeKey;
}

export type SerializedEmbedNode = Spread<
  {
    url: string;
    embedUrl: string;
    provider?: EmbedProviderType;
    width: number;
    height: number;
    align: MediaAlign;
  },
  SerializedLexicalNode
>;

export const DEFAULT_WIDTH = 650;
export const DEFAULT_HEIGHT = 400;

export const $createEmbedNode = (payload: EmbedPayload): EmbedNode => $applyNodeReplacement(new EmbedNode(payload));

export const $isEmbedNode = (node: LexicalNode | null | undefined): node is EmbedNode => node instanceof EmbedNode;
