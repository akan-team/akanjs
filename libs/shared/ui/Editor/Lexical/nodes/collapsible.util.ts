import { $applyNodeReplacement, type LexicalNode, type SerializedElementNode, type Spread } from "lexical";
import { CollapsibleContainerNode, CollapsibleContentNode, CollapsibleTitleNode } from "./Collapsible";

export const CONTAINER_CLASS =
  "akan-collapsible my-3 overflow-hidden rounded-md border border-foreground/15 bg-muted/40";
export const TITLE_CLASS = "cursor-pointer select-none px-3 py-2 font-semibold leading-7 marker:text-foreground/50";
export const CONTENT_CLASS = "border-foreground/10 border-t px-3 py-2 leading-7";

export type SerializedCollapsibleContainerNode = Spread<{ open: boolean }, SerializedElementNode>;

export const $createCollapsibleContainerNode = (open: boolean): CollapsibleContainerNode =>
  $applyNodeReplacement(new CollapsibleContainerNode(open));

export const $isCollapsibleContainerNode = (node: LexicalNode | null | undefined): node is CollapsibleContainerNode =>
  node instanceof CollapsibleContainerNode;

export const $createCollapsibleTitleNode = (): CollapsibleTitleNode =>
  $applyNodeReplacement(new CollapsibleTitleNode());

export const $isCollapsibleTitleNode = (node: LexicalNode | null | undefined): node is CollapsibleTitleNode =>
  node instanceof CollapsibleTitleNode;

export const $createCollapsibleContentNode = (): CollapsibleContentNode =>
  $applyNodeReplacement(new CollapsibleContentNode());

export const $isCollapsibleContentNode = (node: LexicalNode | null | undefined): node is CollapsibleContentNode =>
  node instanceof CollapsibleContentNode;
