import type { TextFormatType } from "lexical";

export interface ToolbarState {
  rect: DOMRect;
  formats: Set<TextFormatType>;
  linkUrl: string | null;
}
