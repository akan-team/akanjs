"use client";
import type { cnst } from "@libs/shared/client";
import { st } from "@libs/shared/client";
import { addFileUntilActive } from "@libs/shared/webkit";
import Accordion from "@yoopta/accordion";
import Blockquote from "@yoopta/blockquote";
import Callout from "@yoopta/callout";
import CodePlugins from "@yoopta/code";
import Divider from "@yoopta/divider";
import YooptaEditor, {
  createYooptaEditor,
  type DeleteBlockOperation,
  type RenderBlockProps,
  type SlateElement,
  type YooptaBlockData,
  type YooptaContentValue,
  type YooptaPlugin,
} from "@yoopta/editor";
import Embed from "@yoopta/embed";
import File, { FileCommands } from "@yoopta/file";
import { HeadingOne, HeadingThree, HeadingTwo } from "@yoopta/headings";
import Image, { ImageCommands } from "@yoopta/image";
import Link from "@yoopta/link";
import { BulletedList, NumberedList, TodoList } from "@yoopta/lists";
import { Bold, CodeMark, Highlight, Italic, Strike, Underline } from "@yoopta/marks";
import Paragraph from "@yoopta/paragraph";
import Table from "@yoopta/table";
import { BlockDndContext, SelectionBox, SortableBlock } from "@yoopta/ui";
import Video, { VideoCommands } from "@yoopta/video";
import type { Any } from "akanjs/base";
import { clsx } from "akanjs/client";
import type { ProtoFile } from "akanjs/constant";
import { isEqual } from "lodash";
import type { DragEvent } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import "./theme/editor.css";

import { BlockActions } from "./BlockActions";
import { EmbedElement } from "./EmbedElement";
import { ExcalidrawPlugin } from "./ExcalidrawPlugin";
import { ImageElement } from "./ImageElement";
import { type MediaKind, SlashMenu } from "./SlashMenu";
import { Toolbar } from "./Toolbar";
import { applyAkanTheme } from "./theme";
import {
  normalizeUploadPolicy,
  reconcileYooptaAttachments,
  validateUploadFile,
  type YooptaUploadPolicy,
} from "./Upload";

const defaultPlugins = [
  Paragraph,
  Table,
  Divider,
  Accordion,
  HeadingOne,
  HeadingTwo,
  HeadingThree,
  Blockquote,
  Callout,
  NumberedList,
  BulletedList,
  TodoList,
  CodePlugins.Code,
  Link,
  Embed,
];

const MARKS = [Bold, Italic, CodeMark, Underline, Strike, Highlight];

const uploadUnavailable = async () => {
  throw new Error("File upload is not configured.");
};

const YOOPTA_TABLE_UI_STYLE = `
[class*="backdrop-blur"]:has(.yoopta-rich-editor),
[class*="backdrop-filter"]:has(.yoopta-rich-editor) {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.yoopta-rich-editor [id^="table-add-column-button"] > div,
.yoopta-rich-editor [id^="table-add-row-button"] > div,
.yoopta-rich-editor [id^="table-column-controls"] > div,
.yoopta-rich-editor [id^="table-row-controls"] > div,
.yoopta-rich-editor .column-resize-handle {
  box-sizing: border-box;
}

.yoopta-rich-editor [id^="table-row-controls"] > div {
  transform: translateX(calc(-50% - 4px)) !important;
}

.yoopta-rich-editor [id^="table-add-column-button"] button,
.yoopta-rich-editor [id^="table-add-row-button"] button,
.yoopta-rich-editor [id^="table-column-controls"] button,
.yoopta-rich-editor [id^="table-row-controls"] button {
  background: var(--color-base-100, Canvas) !important;
  border: 1px solid color-mix(in oklab, var(--color-base-content, CanvasText) 15%, transparent) !important;
  color: var(--color-base-content, CanvasText) !important;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12) !important;
}

.yoopta-rich-editor [id^="table-add-column-button"] button:hover,
.yoopta-rich-editor [id^="table-add-row-button"] button:hover,
.yoopta-rich-editor [id^="table-column-controls"] button:hover,
.yoopta-rich-editor [id^="table-row-controls"] button:hover {
  background: var(--color-base-200, color-mix(in oklab, var(--color-base-content, CanvasText) 8%, transparent)) !important;
}

[data-radix-popper-content-wrapper] [data-slot="dropdown-menu-content"],
[data-radix-popper-content-wrapper] [data-slot="popover-content"],
[data-radix-popper-content-wrapper] [role="menu"][data-radix-menu-content],
.yoopta-rich-editor [data-element-options-content],
.yoopta-rich-editor [data-element-options-select-content],
.yoopta-rich-editor [data-element-options-color-picker-content] {
  background: var(--color-base-100, Canvas) !important;
  color: var(--color-base-content, CanvasText) !important;
  border: 1px solid color-mix(in oklab, var(--color-base-content, CanvasText) 15%, transparent) !important;
  box-shadow: 0 16px 48px -12px rgb(0 0 0 / 0.22), 0 4px 16px -4px rgb(0 0 0 / 0.12) !important;
}

[data-radix-popper-content-wrapper] [data-slot="dropdown-menu-item"]:hover,
[data-radix-popper-content-wrapper] [data-slot="dropdown-menu-item"][data-highlighted] {
  background: var(--color-base-200, color-mix(in oklab, var(--color-base-content, CanvasText) 8%, transparent)) !important;
}
`;

const normalizeValue = (value: unknown): YooptaContentValue | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return undefined;
  if (Array.isArray(value)) return undefined;
  if (typeof value === "object" && Object.keys(value).length) return value as YooptaContentValue;
  return undefined;
};

const createEmptyValue = (): YooptaContentValue => {
  const blockId = crypto.randomUUID();
  const elementId = crypto.randomUUID();
  return {
    [blockId]: {
      id: blockId,
      type: "Paragraph",
      meta: { order: 0, depth: 0 },
      value: [{ id: elementId, type: "paragraph", children: [{ text: "" }] }],
    },
  } as YooptaContentValue;
};

type AddFile = (file: cnst.File | cnst.File[], options?: { idx?: number; limit?: number }) => unknown;

interface YooptaProps {
  defaultReadOnly?: boolean;
  className?: string;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: AddFile;
  attachments?: cnst.File[];
  onAttachmentAdd?: (file: cnst.File) => void;
  onAttachmentsChange?: (files: cnst.File[]) => void;
  onUploadError?: (error: Error) => void;
  onChange: (value: Any) => void;
  onDelete?: (blocks: YooptaBlockData<SlateElement>[]) => void;
  value?: unknown;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
  debug?: boolean;
  plugins?: YooptaPlugin<Record<string, SlateElement>>[];
  uploadPolicy?: YooptaUploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
}

const Yoopta = ({
  defaultReadOnly = false,
  className,
  onChange,
  onDelete,
  value,
  addFile,
  addFilesGql,
  attachments,
  onAttachmentAdd,
  onAttachmentsChange,
  onUploadError,
  plugins,
  uploadPolicy,
  toolbar = true,
  blockActions = true,
  slashMenu = true,
  height,
  placeholder,
  disabled,
}: YooptaProps) => {
  const theme = st.use.theme();
  const readOnly = defaultReadOnly || !!disabled;
  const policy = useMemo(() => normalizeUploadPolicy(uploadPolicy), [uploadPolicy]);
  const emptyValueRef = useRef<YooptaContentValue>(createEmptyValue());
  const lastValueRef = useRef<YooptaContentValue>(normalizeValue(value) ?? emptyValueRef.current);
  const attachmentsRef = useRef<cnst.File[]>(attachments ?? []);
  const onAttachmentAddRef = useRef(onAttachmentAdd);
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const onUploadErrorRef = useRef(onUploadError);

  useEffect(() => {
    attachmentsRef.current = attachments ?? [];
  }, [attachments]);

  useEffect(() => {
    onAttachmentAddRef.current = onAttachmentAdd;
    onAttachmentsChangeRef.current = onAttachmentsChange;
    onUploadErrorRef.current = onUploadError;
  }, [onAttachmentAdd, onAttachmentsChange, onUploadError]);

  const trackUploadedFile = useCallback(
    async (file: cnst.File | ProtoFile) => {
      if (addFile) await addFile(file as cnst.File);
      onAttachmentAddRef.current?.(file as cnst.File);

      const nextAttachments = [
        ...attachmentsRef.current.filter((attachment) => attachment.id !== file.id),
        file as cnst.File,
      ];
      attachmentsRef.current = nextAttachments;
      onAttachmentsChangeRef.current?.(nextAttachments);
    },
    [addFile],
  );

  const resolvedPlugins = useMemo(() => {
    const mediaPlugins = [
      addFilesGql
        ? Image.extend({
            options: {
              upload: async (fileData, onProgress) => {
                try {
                  validateUploadFile(fileData, { ...policy, accept: "image/*" }, attachmentsRef.current.length);
                  const file = await addFileUntilActive(fileData, addFilesGql, onProgress);
                  await trackUploadedFile(file);
                  const [width = 0, height = 0] = file.imageSize ?? [];
                  return { id: file.id, src: file.url, alt: file.filename, sizes: { width, height } };
                } catch (error) {
                  onUploadErrorRef.current?.(error as Error);
                  throw error;
                }
              },
            },
          })
        : Image.extend({
            options: {
              upload: uploadUnavailable,
            },
          }),
      addFilesGql
        ? Video.extend({
            options: {
              upload: async (fileData: File, onProgress) => {
                try {
                  validateUploadFile(fileData, { ...policy, accept: "video/*" }, attachmentsRef.current.length);
                  const file = await addFileUntilActive(fileData, addFilesGql, onProgress);
                  await trackUploadedFile(file);
                  const [width = 0, height = 0] = file.imageSize ?? [];
                  return { id: file.id, src: file.url, sizes: { width, height } };
                } catch (error) {
                  onUploadErrorRef.current?.(error as Error);
                  throw error;
                }
              },
              uploadPoster: async (fileData: File, onProgress) => {
                try {
                  validateUploadFile(fileData, { ...policy, accept: "image/*" }, attachmentsRef.current.length);
                  const file = await addFileUntilActive(fileData, addFilesGql, onProgress);
                  await trackUploadedFile(file);
                  return file.url;
                } catch (error) {
                  onUploadErrorRef.current?.(error as Error);
                  throw error;
                }
              },
              accept: "video/*",
              maxFileSize: policy.maxFileSize,
              allowedProviders: policy.allowedEmbedProviders,
            },
          })
        : Video.extend({
            options: {
              upload: uploadUnavailable,
              uploadPoster: uploadUnavailable,
              allowedProviders: policy.allowedEmbedProviders,
            },
          }),
      addFilesGql
        ? File.extend({
            options: {
              upload: async (fileData, onProgress) => {
                try {
                  validateUploadFile(fileData, policy, attachmentsRef.current.length);
                  const file = await addFileUntilActive(fileData, addFilesGql, onProgress);
                  await trackUploadedFile(file);
                  return {
                    id: file.id,
                    src: file.url,
                    name: file.filename,
                    size: file.size,
                    format: file.filename?.split(".").pop(),
                  };
                } catch (error) {
                  onUploadErrorRef.current?.(error as Error);
                  throw error;
                }
              },
              accept: policy.accept,
              maxFileSize: policy.maxFileSize,
            },
          })
        : File.extend({
            options: {
              upload: uploadUnavailable,
            },
          }),
    ];
    const excalidrawPlugin = ExcalidrawPlugin.extend({
      options: {
        uploadFile: addFilesGql
          ? async (fileData: File) => {
              validateUploadFile(fileData, { ...policy, accept: "image/*" }, attachmentsRef.current.length);
              const file = await addFileUntilActive(fileData, addFilesGql);
              await trackUploadedFile(file);
              return {
                id: file.id,
                url: file.url,
                mimeType: (file as cnst.File).mimetype,
              };
            }
          : undefined,
        onUploadError: onUploadErrorRef.current,
      },
    });

    const themedPlugins = applyAkanTheme([
      ...(plugins ?? []),
      ...defaultPlugins,
      ...mediaPlugins,
      excalidrawPlugin,
    ] as YooptaPlugin<Record<string, SlateElement>>[]);

    return themedPlugins.map((plugin) => {
      const pluginWithExtend = plugin as unknown as {
        getPlugin: { type: string };
        extend: (config: unknown) => YooptaPlugin<Record<string, SlateElement>>;
      };
      if (pluginWithExtend.getPlugin.type === "Image") {
        return pluginWithExtend.extend({ elements: { image: { render: ImageElement } } });
      }
      if (pluginWithExtend.getPlugin.type === "Embed") {
        return pluginWithExtend.extend({ elements: { embed: { render: EmbedElement } } });
      }
      return plugin;
    });
  }, [addFilesGql, plugins, policy, trackUploadedFile]);

  const editor = useMemo(
    () =>
      createYooptaEditor({
        plugins: resolvedPlugins,
        marks: readOnly ? [] : MARKS,
        value: lastValueRef.current,
        readOnly,
      }),
    [readOnly, resolvedPlugins],
  );

  useEffect(() => {
    const nextValue = normalizeValue(value);
    const nextEditorValue = nextValue ?? emptyValueRef.current;
    if (isEqual(lastValueRef.current, nextEditorValue)) return;
    lastValueRef.current = nextEditorValue;
    editor.setEditorValue(nextEditorValue);
  }, [editor, value]);

  useEffect(() => {
    editor.readOnly = readOnly;
  }, [editor, readOnly]);

  const uploadAndInsertMedia = useCallback(
    async (kind: MediaKind, fileData: File) => {
      if (!addFilesGql) {
        onUploadErrorRef.current?.(new Error("File upload is not configured."));
        return;
      }

      try {
        const mediaPolicy =
          kind === "image"
            ? { ...policy, accept: "image/*" }
            : kind === "video"
              ? { ...policy, accept: "video/*" }
              : policy;
        validateUploadFile(fileData, mediaPolicy, attachmentsRef.current.length);
        const file = await addFileUntilActive(fileData, addFilesGql);
        await trackUploadedFile(file);
        const at = editor.path.current ?? undefined;

        if (kind === "image") {
          const [width = 0, height = 0] = file.imageSize ?? [];
          ImageCommands.insertImage(editor, {
            at,
            focus: true,
            props: { id: file.id, src: file.url, alt: file.filename, sizes: { width, height } },
          });
        } else if (kind === "video") {
          const [width = 0, height = 0] = file.imageSize ?? [];
          VideoCommands.insertVideo(editor, {
            at,
            focus: true,
            props: { id: file.id, src: file.url, sizes: { width, height } },
          });
        } else {
          FileCommands.insertFile(editor, {
            at,
            focus: true,
            props: {
              id: file.id,
              src: file.url,
              name: file.filename,
              size: file.size,
              format: file.filename?.split(".").pop(),
            },
          });
        }
      } catch (error) {
        onUploadErrorRef.current?.(error as Error);
      }
    },
    [addFilesGql, editor, policy, trackUploadedFile],
  );

  const uploadDroppedFiles = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.files.length) return;

      event.preventDefault();
      event.stopPropagation();

      [...event.dataTransfer.files].forEach((file) => {
        const kind: MediaKind = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : "file";
        void uploadAndInsertMedia(kind, file);
      });
    },
    [uploadAndInsertMedia],
  );

  const renderBlock = useCallback(
    ({ blockId, children }: RenderBlockProps) =>
      readOnly ? (
        <div data-yoopta-block-id={blockId}>{children}</div>
      ) : (
        <SortableBlock id={blockId} disabled={false} useDragHandle>
          {children}
        </SortableBlock>
      ),
    [readOnly],
  );

  const editorContent = (
    <YooptaEditor
      className={clsx(
        "yoopta-rich-editor",
        "[&_.yoo-embed-items-center]:text-black! [&_.yoo-image-font-medium]:text-gray-500! [&_.yoo-video-font-medium]:text-gray-500! [&_.yoopta-button]:text-black [&_.yoopta-mark-code]:text-black",
        "[&_[data-element-options-content]]:border [&_[data-element-options-content]]:border-base-content/15 [&_[data-element-options-content]]:bg-base-100 [&_[data-element-options-content]]:text-base-content [&_[data-element-options-content]]:shadow-xl",
        "[&_[data-element-options-select-content]]:border [&_[data-element-options-select-content]]:border-base-content/15 [&_[data-element-options-select-content]]:bg-base-100 [&_[data-element-options-select-content]]:text-base-content [&_[data-element-options-select-content]]:shadow-xl",
        "[&_[data-radix-popper-content-wrapper]]:z-50",
        className,
        {
          "[&_.yoopta-block-actions_button]:text-white!": theme === "dark" || theme === "system",
          "[&_.yoo-file-font-normal]:text-gray-400!": theme === "dark" || theme === "system",
        },
      )}
      editor={editor}
      placeholder={placeholder ?? "Type something"}
      style={{ width: "100%", minHeight: height ?? (readOnly ? undefined : "8rem"), position: "relative" }}
      onChange={(nextValue, options) => {
        lastValueRef.current = nextValue;
        onChange(nextValue as unknown as Any);

        const nextAttachments = reconcileYooptaAttachments(nextValue, attachmentsRef.current);
        if (onAttachmentsChangeRef.current && nextAttachments.length !== attachmentsRef.current.length) {
          attachmentsRef.current = nextAttachments;
          onAttachmentsChangeRef.current(nextAttachments);
        }

        if (!onDelete) return;
        const deleteBlocks = options.operations.filter((operation) => operation.type === "delete_block");
        if (deleteBlocks.length > 0) {
          onDelete(
            deleteBlocks.map(
              (operation: DeleteBlockOperation) => operation.block as unknown as YooptaBlockData<SlateElement>,
            ),
          );
        }
      }}
      renderBlock={renderBlock}
    >
      {!readOnly ? (
        <>
          {toolbar ? <Toolbar /> : null}
          {slashMenu ? <SlashMenu onUploadMedia={(kind, file) => void uploadAndInsertMedia(kind, file)} /> : null}
          {blockActions ? <BlockActions /> : null}
          <SelectionBox />
        </>
      ) : null}
    </YooptaEditor>
  );

  return readOnly ? (
    <div>
      <style>{YOOPTA_TABLE_UI_STYLE}</style>
      {editorContent}
    </div>
  ) : (
    <BlockDndContext editor={editor}>
      <style>{YOOPTA_TABLE_UI_STYLE}</style>
      <div
        onDragOverCapture={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDropCapture={uploadDroppedFiles}
      >
        {editorContent}
      </div>
    </BlockDndContext>
  );
};

interface EditorProps {
  readOnly?: boolean;
  className?: string;
  value?: unknown;
  onChange: (slate: unknown) => void;
  onDelete?: (blocks: YooptaBlockData<SlateElement>[]) => void;
  addFilesGql?: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>;
  addFile?: AddFile;
  attachments?: cnst.File[];
  onAttachmentAdd?: (file: cnst.File) => void;
  onAttachmentsChange?: (files: cnst.File[]) => void;
  onUploadError?: (error: Error) => void;
  defaultValue?: unknown;
  height?: string;
  placeholder?: string;
  disabled?: boolean;
  debug?: boolean;
  plugins?: YooptaPlugin<Record<string, SlateElement>>[];
  uploadPolicy?: YooptaUploadPolicy;
  toolbar?: boolean;
  blockActions?: boolean;
  slashMenu?: boolean;
}

export default function Editor({
  readOnly = false,
  className,
  value,
  defaultValue,
  onChange,
  onDelete,
  addFilesGql,
  addFile,
  attachments,
  onAttachmentAdd,
  onAttachmentsChange,
  onUploadError,
  plugins,
  uploadPolicy,
  toolbar,
  blockActions,
  slashMenu,
  height,
  placeholder,
  disabled,
}: EditorProps) {
  return (
    <Yoopta
      value={value ?? defaultValue}
      defaultReadOnly={readOnly}
      className={className}
      addFilesGql={addFilesGql}
      addFile={addFile}
      attachments={attachments}
      onAttachmentAdd={onAttachmentAdd}
      onAttachmentsChange={onAttachmentsChange}
      onUploadError={onUploadError}
      onChange={onChange}
      onDelete={onDelete}
      plugins={plugins}
      uploadPolicy={uploadPolicy}
      toolbar={toolbar}
      blockActions={blockActions}
      slashMenu={slashMenu}
      height={height}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
