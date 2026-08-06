import type { NodeKey } from "lexical";

export interface CellAnchor {
  cellKey: NodeKey;
  rect: DOMRect;
}
