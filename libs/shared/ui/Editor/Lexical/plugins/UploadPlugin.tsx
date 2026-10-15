"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { Err } from "@libs/shared/client";
import {
  $createRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";

import type { EditorFeatureKey } from "../feature";
import { insertUploaded, uploadKindOf } from "../media";
import { useEditorUpload } from "../UploadContext";

interface UploadPluginProps {
  features: ReadonlySet<EditorFeatureKey>;
}

interface CaretPositionDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

// Firefox only has the standard `caretPositionFromPoint`; Safari only the older `caretRangeFromPoint`.
const rangeAtPoint = (x: number, y: number): Range | null => {
  const doc = document as unknown as CaretPositionDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (!position) return doc.caretRangeFromPoint?.(x, y) ?? null;
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
};

/**
 * Uploads files dropped onto, or images pasted into, the editor and inserts the matching media node — each
 * kind only where the field's `features` offer it, so a field without files never grows one from a drop.
 */
export const UploadPlugin = ({ features }: UploadPluginProps) => {
  const [editor] = useLexicalComposerContext();
  const upload = useEditorUpload();

  useEffect(() => {
    if (!upload.canUpload) return;

    const uploadAndInsert = async (files: File[]) => {
      for (const file of files) {
        const kind = uploadKindOf(file);
        if (features.has(kind)) await insertUploaded(editor, upload, file, kind);
        else upload.onError(new Err("shared.error.fileTypeNotAllowed", { fileType: file.type || file.name }));
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
          if (!files?.length) return false;
          event.preventDefault();
          // The node lands at the caret once its upload finishes, so the caret moves to the drop point now.
          const range = rangeAtPoint(event.clientX, event.clientY);
          if (range && editor.getRootElement()?.contains(range.startContainer)) {
            const selection = $createRangeSelection();
            selection.applyDOMRange(range);
            $setSelection(selection);
          }
          void uploadAndInsert([...files]);
          return true;
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
  }, [editor, upload, features]);

  return null;
};
