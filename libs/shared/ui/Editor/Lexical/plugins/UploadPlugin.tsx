"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_LOW, DRAGOVER_COMMAND, DROP_COMMAND, PASTE_COMMAND } from "lexical";
import { useEffect } from "react";

import { insertFile, insertImage, insertVideo } from "../media";
import { useEditorUpload } from "../UploadContext";

/**
 * Uploads files dropped onto, or images pasted into, the editor and inserts the
 * matching media node. Replaces the Yoopta `onDropCapture`/paste handlers. Only
 * active when uploads are configured; each file goes through the context's
 * `uploadFile` (which validates + tracks the attachment) before insertion.
 */
export const UploadPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const upload = useEditorUpload();

  useEffect(() => {
    if (!upload.canUpload) return;

    const uploadAndInsert = async (files: File[]) => {
      for (const file of files) {
        try {
          if (file.type.startsWith("image/")) {
            const uploaded = await upload.uploadFile(file, "image/*");
            const [width = 0, height = 0] = uploaded.imageSize ?? [];
            insertImage(editor, {
              fileId: uploaded.id,
              src: uploaded.url,
              alt: uploaded.filename,
              width,
              height,
            });
          } else if (file.type.startsWith("video/")) {
            const uploaded = await upload.uploadFile(file, "video/*");
            const [width = 0, height = 0] = uploaded.imageSize ?? [];
            insertVideo(editor, { fileId: uploaded.id, src: uploaded.url, width, height });
          } else {
            const uploaded = await upload.uploadFile(file);
            insertFile(editor, {
              fileId: uploaded.id,
              src: uploaded.url,
              name: uploaded.filename,
              size: uploaded.size,
              format: uploaded.filename?.split(".").pop(),
            });
          }
        } catch (error) {
          upload.onError(error as Error);
        }
      }
    };

    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event: DragEvent) => {
          if (event.dataTransfer?.types.includes("Files")) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event: DragEvent) => {
          const files = event.dataTransfer?.files;
          if (files && files.length > 0) {
            event.preventDefault();
            void uploadAndInsert([...files]);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event: ClipboardEvent) => {
          const files = event.clipboardData?.files;
          const images = files ? [...files].filter((file) => file.type.startsWith("image/")) : [];
          if (images.length > 0) {
            event.preventDefault();
            void uploadAndInsert(images);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, upload]);

  return null;
};
