"use client";

import { useYooptaEditor } from "@yoopta/editor";
import { SlashCommandMenu } from "@yoopta/ui";
import { useSlashCommandActions, useSlashCommandItems, useSlashCommandState } from "@yoopta/ui/slash-command-menu";
import { type KeyboardEvent, type RefObject, useCallback, useMemo, useRef } from "react";
import { Range, Editor as SlateEditor, Transforms } from "slate";

export type MediaKind = "image" | "video" | "file";

interface SlashItem {
  id: string;
  title: string;
  description?: string;
  group?: string;
  onSelect?: () => void;
}
type SlashMenuItem = Omit<SlashItem, "onSelect">;

const GROUP_LABELS: Record<string, string> = {
  text: "Text",
  list: "Lists",
  media: "Media",
  structure: "Structure",
};

interface SlashMenuProps {
  onUploadMedia?: (kind: MediaKind, file: File) => void;
}

export const SlashMenu = ({ onUploadMedia }: SlashMenuProps) => {
  const editor = useYooptaEditor();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = useCallback((kind: MediaKind) => {
    if (kind === "image") imageInputRef.current?.click();
    else if (kind === "video") videoInputRef.current?.click();
    else fileInputRef.current?.click();
  }, []);

  const toggleTextBlock = useCallback(
    (type: string) => {
      editor.toggleBlock(type, { scope: "block", preserveContent: true, focus: true });
    },
    [editor],
  );

  const items = useMemo<SlashItem[]>(
    () => [
      block("Paragraph", "Paragraph", "Plain text", "text", () => toggleTextBlock("Paragraph")),
      block("HeadingOne", "Heading 1", "Big section heading", "text", () => toggleTextBlock("HeadingOne")),
      block("HeadingTwo", "Heading 2", "Medium section heading", "text", () => toggleTextBlock("HeadingTwo")),
      block("HeadingThree", "Heading 3", "Small section heading", "text", () => toggleTextBlock("HeadingThree")),
      block("BulletedList", "Bulleted list", "Create a simple bullet list", "list", () =>
        toggleTextBlock("BulletedList"),
      ),
      block("NumberedList", "Numbered list", "Create an ordered list", "list", () => toggleTextBlock("NumberedList")),
      block("TodoList", "Todo list", "Create a checklist", "list", () => toggleTextBlock("TodoList")),
      block("Image", "Image", "Upload an image", "media", () => selectFile("image")),
      block("Video", "Video", "Upload a video", "media", () => selectFile("video")),
      block("File", "File", "Attach a file", "media", () => selectFile("file")),
      block("Embed", "Embed", "Embed a supported URL", "media", () => toggleTextBlock("Embed")),
      block("Excalidraw", "Excalidraw", "Draw a diagram", "media", () =>
        editor.insertBlock("Excalidraw", { at: editor.path.current ?? undefined, focus: false }),
      ),
      block("Table", "Table", "Add a table", "structure", () => toggleTextBlock("Table")),
      block("Blockquote", "Quote", "Add a quote", "structure", () => toggleTextBlock("Blockquote")),
      block("Callout", "Callout", "Highlight an important note", "structure", () => toggleTextBlock("Callout")),
      block("Code", "Code", "Add a code block", "structure", () => toggleTextBlock("Code")),
      block("Divider", "Divider", "Separate content", "structure", () => toggleTextBlock("Divider")),
    ],
    [selectFile, toggleTextBlock],
  );
  const actionMap = useMemo(() => new Map(items.map((item) => [item.id, item.onSelect])), [items]);
  const menuItems = useMemo<SlashMenuItem[]>(() => items.map(({ onSelect, ...item }) => item), [items]);

  const removeSlashTrigger = useCallback(() => {
    const block = editor.getBlock({ at: editor.path.current });
    const slate = block ? editor.blockEditorsMap[block.id] : null;
    if (!slate?.selection || !Range.isCollapsed(slate.selection)) return;

    const before = SlateEditor.before(slate, slate.selection.anchor, { unit: "character" });
    if (!before) return;

    const slashRange = { anchor: before, focus: slate.selection.anchor };
    if (SlateEditor.string(slate, slashRange) === "/") Transforms.delete(slate, { at: slashRange });
  }, [editor]);

  const runAction = useCallback(
    (id: string) => {
      removeSlashTrigger();
      actionMap.get(id)?.();
    },
    [actionMap, removeSlashTrigger],
  );

  return (
    <>
      <SlashCommandMenu items={menuItems} onSelect={(item: SlashMenuItem) => runAction(item.id)}>
        <SlashMenuContent runAction={runAction} />
      </SlashCommandMenu>
      <MediaInput inputRef={imageInputRef} accept="image/*" kind="image" onUploadMedia={onUploadMedia} />
      <MediaInput inputRef={videoInputRef} accept="video/*" kind="video" onUploadMedia={onUploadMedia} />
      <MediaInput inputRef={fileInputRef} kind="file" onUploadMedia={onUploadMedia} />
    </>
  );
};

interface SlashMenuContentProps {
  runAction: (id: string) => void;
}

const SlashMenuContent = ({ runAction }: SlashMenuContentProps) => {
  const state = useSlashCommandState();
  const actions = useSlashCommandActions();
  const { groupedItems, filteredItems } = useSlashCommandItems();

  const runSelected = () => {
    const item = filteredItems[state.selectedIndex] ?? filteredItems[0];
    if (!item) return;
    runAction(item.id);
    actions.close();
  };

  return (
    <SlashCommandMenu.Content className="z-50 rounded-md border border-base-content/10 bg-base-100 p-2 shadow-lg">
      <SlashCommandMenu.Input
        className="input input-sm mb-2 w-full"
        placeholder="Search blocks..."
        onKeyDownCapture={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          event.stopPropagation();
          runSelected();
        }}
      />
      <SlashCommandMenu.List className="max-h-80 overflow-y-auto">
        {[...groupedItems.entries()].map(([group, groupItems]) => (
          <SlashCommandMenu.Group key={group} heading={GROUP_LABELS[group] ?? group}>
            {groupItems.map((item: SlashItem) => (
              <SlashCommandMenu.Item key={item.id} value={item.id} title={item.title} description={item.description}>
                <div
                  className="flex w-full items-start gap-2"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    runAction(item.id);
                    actions.close();
                  }}
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{item.title}</span>
                    {item.description ? <span className="text-base-content/50 text-xs">{item.description}</span> : null}
                  </div>
                </div>
              </SlashCommandMenu.Item>
            ))}
          </SlashCommandMenu.Group>
        ))}
        <SlashCommandMenu.Empty>No blocks found</SlashCommandMenu.Empty>
      </SlashCommandMenu.List>
    </SlashCommandMenu.Content>
  );
};

const MediaInput = ({
  inputRef,
  accept,
  kind,
  onUploadMedia,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  accept?: string;
  kind: MediaKind;
  onUploadMedia?: (kind: MediaKind, file: File) => void;
}) => (
  <input
    ref={inputRef}
    type="file"
    accept={accept}
    className="hidden"
    onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (file) onUploadMedia?.(kind, file);
    }}
  />
);

const block = (id: string, title: string, description: string, group: string, onSelect: () => void): SlashItem => ({
  id,
  title,
  description,
  group,
  onSelect,
});
