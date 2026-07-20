import type { cnst } from "@libs/shared/client";
import type { SerializedLexicalNode } from "lexical";

/**
 * Attachment reconcile — pure walkers over a serialized editor state, kept free
 * of node/`@lexical/react` imports so they are unit testable (and safe under
 * `bun test`). The Lexical counterpart of Yoopta's
 * `extractYooptaAttachmentIds`/`reconcileYooptaAttachments`.
 */

/** Node types that carry a single uploaded `fileId`. */
const FILE_BACKED_TYPES = new Set(["akan-image", "akan-video", "akan-file"]);

interface MaybeChildren {
  children?: unknown;
}

interface MaybeExcalidraw {
  scene?: { files?: Record<string, { id?: unknown } | null> };
}

const walk = (node: SerializedLexicalNode, ids: Set<string>): void => {
  const type = node.type;
  const fileId = (node as { fileId?: unknown }).fileId;
  if (typeof type === "string" && FILE_BACKED_TYPES.has(type) && typeof fileId === "string" && fileId) {
    ids.add(fileId);
  }
  // Excalidraw embeds one or more uploaded images inside its scene's file map.
  if (type === "akan-excalidraw") {
    const files = (node as MaybeExcalidraw).scene?.files;
    if (files) {
      for (const ref of Object.values(files)) {
        const id = ref?.id;
        if (typeof id === "string" && id) ids.add(id);
      }
    }
  }
  const children = (node as MaybeChildren).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === "object") walk(child as SerializedLexicalNode, ids);
    }
  }
};

/** Recursively collects `fileId`s from file-backed media nodes in a serialized state. */
export const collectAttachmentIds = (serializedState: unknown): string[] => {
  const ids = new Set<string>();
  const root = (serializedState as { root?: SerializedLexicalNode } | null | undefined)?.root;
  if (!root) return [];
  walk(root, ids);
  return [...ids];
};

/** Filters `attachments` down to those still referenced by the serialized state. */
export const reconcileAttachments = (serializedState: unknown, attachments: cnst.File[] = []): cnst.File[] => {
  const ids = new Set(collectAttachmentIds(serializedState));
  return attachments.filter((attachment) => ids.has(attachment.id));
};
