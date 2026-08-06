interface ContentNode {
  type?: string;
  text?: string;
  children?: ContentNode[];
}

const nodeText = (node: ContentNode): string => {
  if (typeof node.text === "string") return node.text;
  const children = Array.isArray(node.children) ? node.children : [];
  const childText = children.map(nodeText).join("");
  switch (node.type) {
    case "quote":
    case "blockquote":
      return `> ${childText}\n`;
    case "listitem":
    case "li":
      return `- ${childText}\n`;
    // Block-level containers get a trailing newline; inline/leaf nodes don't.
    case "paragraph":
    case "p":
    case "heading":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `${childText}\n`;
    default:
      return childText;
  }
};

/**
 * Extracts plain text from stored editor `content` for previews / meta / SEO.
 *
 * Reads the Lexical `SerializedEditorState` (`{ root: { children } }`) shape used
 * by `Editor.Rich`. Stays defensive against wiped (`[]`), legacy Slate-array, or
 * garbage input — returns `""` rather than throwing — so callers can pass raw
 * `content` of any vintage.
 */
export const extractTextFromContent = (content: unknown): string => {
  if (!content || typeof content !== "object") return "";
  if (Array.isArray(content)) return content.map((node) => nodeText(node as ContentNode)).join("");
  const root = (content as { root?: ContentNode }).root;
  return root ? nodeText(root) : "";
};
