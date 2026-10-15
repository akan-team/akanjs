import { $insertNodeToNearestRoot } from "@lexical/utils";
import type { LexicalEditor } from "lexical";

import { $createEmbedNode, type EmbedPayload } from "./nodes/embedNode.util";
import { $createExcalidrawNode, type ExcalidrawPayload } from "./nodes/excalidrawNode.util";
import { $createFileNode, type FilePayload } from "./nodes/fileNode.util";
import { $createImageNode, type ImagePayload } from "./nodes/imageNode.util";
import { $createMermaidNode, defaultMermaidCode, type MermaidPayload } from "./nodes/mermaidNode.util";
import { $createVideoNode, type VideoPayload } from "./nodes/videoNode.util";
import type { EditorUpload } from "./UploadContext";

export { collectAttachmentIds, reconcileAttachments } from "./attachments";

export type UploadKind = "image" | "video" | "file";

export const uploadKindOf = (file: File): UploadKind =>
  file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";

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

// Seeded with a sample diagram (unlike the other media nodes) so the block draws
// something the moment it lands — an empty mermaid source renders nothing at all.
export const insertMermaid = (editor: LexicalEditor, payload: MermaidPayload = {}): void => {
  editor.update(() => $insertNodeToNearestRoot($createMermaidNode({ code: defaultMermaidCode, ...payload })));
};

export const insertUploaded = async (editor: LexicalEditor, upload: EditorUpload, file: File, kind: UploadKind) => {
  try {
    const uploaded = await upload.uploadFile(file, kind === "file" ? undefined : `${kind}/*`);
    if (!uploaded) return;
    const [width = 0, height = 0] = uploaded.imageSize ?? [];
    if (kind === "image")
      insertImage(editor, { fileId: uploaded.id, src: uploaded.url, alt: uploaded.filename, width, height });
    else if (kind === "video") insertVideo(editor, { fileId: uploaded.id, src: uploaded.url, width, height });
    else
      insertFile(editor, {
        fileId: uploaded.id,
        src: uploaded.url,
        name: uploaded.filename,
        size: uploaded.size,
        format: uploaded.filename?.split(".").pop(),
      });
  } catch (error) {
    upload.onError(error as Error);
  }
};
