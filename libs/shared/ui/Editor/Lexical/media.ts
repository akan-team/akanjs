import { $insertNodeToNearestRoot } from "@lexical/utils";
import type { LexicalEditor } from "lexical";

import { $createEmbedNode, type EmbedPayload } from "./nodes/embedNode.util";
import { $createExcalidrawNode, type ExcalidrawPayload } from "./nodes/excalidrawNode.util";
import { $createFileNode, type FilePayload } from "./nodes/fileNode.util";
import { $createImageNode, type ImagePayload } from "./nodes/imageNode.util";
import { $createVideoNode, type VideoPayload } from "./nodes/videoNode.util";

export { collectAttachmentIds, reconcileAttachments } from "./attachments";

/**
 * Media insertion helpers for the decorator nodes. Each drops a fresh node at
 * the nearest root block (which also selects it). Attachment reconcile lives in
 * the pure `./attachments` module (re-exported above for convenience).
 */

export const insertImage = (editor: LexicalEditor, payload: ImagePayload): void => {
  editor.update(() => $insertNodeToNearestRoot($createImageNode(payload)));
};

export const insertVideo = (editor: LexicalEditor, payload: VideoPayload): void => {
  editor.update(() => $insertNodeToNearestRoot($createVideoNode(payload)));
};

export const insertFile = (editor: LexicalEditor, payload: FilePayload): void => {
  editor.update(() => $insertNodeToNearestRoot($createFileNode(payload)));
};

export const insertEmbed = (editor: LexicalEditor, payload: EmbedPayload = {}): void => {
  editor.update(() => $insertNodeToNearestRoot($createEmbedNode(payload)));
};

export const insertExcalidraw = (editor: LexicalEditor, payload: ExcalidrawPayload = {}): void => {
  editor.update(() => $insertNodeToNearestRoot($createExcalidrawNode(payload)));
};
