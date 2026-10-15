import type { TextFormatType } from "lexical";

import type { EditorFeatureKey } from "./feature";

/**
 * Which feature owns each of Lexical's text formats.
 *
 * The toolbar renders a button for a format only when its feature is on, and `FormatGuardPlugin`
 * swallows the command for one whose feature is off — the two have to agree, or a field grows a
 * keyboard shortcut with no button to undo it. A format missing here is reachable through neither.
 */
export const formatFeatures = {
  bold: "emphasis",
  italic: "emphasis",
  underline: "underline",
  strikethrough: "strikethrough",
  code: "inlineCode",
  highlight: "highlight",
} as const satisfies { [format: string]: EditorFeatureKey };

export type GuardedFormat = keyof typeof formatFeatures;

export const isGuardedFormat = (format: TextFormatType): format is GuardedFormat => format in formatFeatures;
