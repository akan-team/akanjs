export interface MentionRef {
  refName: string;
  refId: string;
}

interface ContentNode {
  type?: string;
  refName?: unknown;
  refId?: unknown;
  children?: unknown;
}

const walk = (node: ContentNode, refs: Map<string, MentionRef>) => {
  if (node.type === "akan-mention" && typeof node.refName === "string" && typeof node.refId === "string") {
    refs.set(`${node.refName}:${node.refId}`, { refName: node.refName, refId: node.refId });
  }
  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (child && typeof child === "object") walk(child as ContentNode, refs);
  }
};

/**
 * Collects the domain models mentioned in stored editor `content`, de-duplicated.
 *
 * Reads the serialized `MentionNode` shape out of a Lexical `SerializedEditorState`
 * without touching the editor — services (notifications, backlinks) run server-side
 * and must not import `ui/`. Defensive against wiped, legacy, or garbage content:
 * returns `[]` rather than throwing.
 */
export const collectMentions = (content: unknown): MentionRef[] => {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const root = (content as { root?: ContentNode }).root;
  if (!root) return [];
  const refs = new Map<string, MentionRef>();
  walk(root, refs);
  return [...refs.values()];
};
