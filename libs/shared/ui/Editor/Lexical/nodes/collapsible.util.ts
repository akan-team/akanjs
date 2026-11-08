import { $applyNodeReplacement, type LexicalNode, type SerializedElementNode, type Spread } from "lexical";
import { CollapsibleContainerNode } from "./CollapsibleContainerNode";
import { CollapsibleContentNode } from "./CollapsibleContentNode";
import { CollapsibleTitleNode } from "./CollapsibleTitleNode";

export const containerClass = "akan-collapsible my-1";
export const titleClass =
  "relative cursor-text list-none pl-6 leading-7 before:absolute before:top-0.5 before:left-0 before:flex before:size-6 before:cursor-pointer before:items-center before:justify-center before:rounded before:text-foreground/50 before:text-sm before:transition-transform before:content-['▸'] hover:before:bg-muted [[open]>&]:before:rotate-90 [&::-webkit-details-marker]:hidden";
export const contentClass = "pl-6 leading-7";

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
