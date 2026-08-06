import { $applyNodeReplacement, type LexicalNode, type SerializedElementNode, type Spread } from "lexical";
import type { CalloutVariant } from "../theme";
import { CalloutNode } from "./CalloutNode";

export type { CalloutVariant };

export type SerializedCalloutNode = Spread<{ variant: CalloutVariant }, SerializedElementNode>;

export const $createCalloutNode = (variant: CalloutVariant = "info"): CalloutNode =>
  $applyNodeReplacement(new CalloutNode(variant));

export const $isCalloutNode = (node: LexicalNode | null | undefined): node is CalloutNode =>
  node instanceof CalloutNode;
