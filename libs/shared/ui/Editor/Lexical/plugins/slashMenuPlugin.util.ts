import type { usePage } from "@libs/shared/client";

import {
  formatBulletList,
  formatCallout,
  formatCheckList,
  formatCode,
  formatHeading,
  formatNumberedList,
  formatParagraph,
  formatQuote,
  insertCollapsible,
  insertDivider,
  insertTable,
} from "../blocks";
import type { EditorFeatureKey } from "../feature";
import { insertEmbed, insertExcalidraw, insertMermaid, insertUploaded } from "../media";
import type { MentionSource } from "../mention.type";
import type { EditorSlashOption } from "../plugin";
import type { EditorUpload } from "../UploadContext";
import { openMentionSource } from "./mentionPlugin.command";
import { SlashOption } from "./slashMenuPlugin.option";

/** Opens a transient file picker and forwards the chosen file. */
const openFilePicker = (accept: string, onPick: (file: File) => void) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) onPick(file);
  };
  input.click();
};

interface BuildOptionsInput {
  l: ReturnType<typeof usePage>["l"];
  upload: EditorUpload;
  /** The editor's enabled features. Every entry naming one the field does not have is dropped. */
  features: ReadonlySet<EditorFeatureKey>;
  extraOptions: readonly EditorSlashOption[];
  mentionSources: readonly MentionSource[];
}

/**
 * Builds the option set. The upload-backed media options (image/video/file) need uploads configured
 * on top of their feature; every other built-in entry is present exactly when its feature is.
 * `extraOptions` are the entries contributed by the editor's `plugins` and are never filtered —
 * passing the plugin is the opt-in — and each `mentionSources` entry gets a `/<label>` entry of its own.
 */
export const buildOptions = ({
  l,
  upload,
  features,
  extraOptions,
  mentionSources,
}: BuildOptionsInput): SlashOption[] => {
  const options: SlashOption[] = [
    new SlashOption("paragraph", {
      label: l("shared.editor-paragraph"),
      description: l("shared.editor-paragraphDesc"),
      group: "text",
      keywords: ["p", "text", "plain"],
      run: formatParagraph,
    }),
    new SlashOption("h1", {
      feature: "heading",
      label: l("shared.editor-heading1"),
      description: l("shared.editor-heading1Desc"),
      group: "text",
      keywords: ["title", "h1", "heading"],
      run: (editor) => formatHeading(editor, "h1"),
    }),
    new SlashOption("h2", {
      feature: "heading",
      label: l("shared.editor-heading2"),
      description: l("shared.editor-heading2Desc"),
      group: "text",
      keywords: ["subtitle", "h2", "heading"],
      run: (editor) => formatHeading(editor, "h2"),
    }),
    new SlashOption("h3", {
      feature: "heading",
      label: l("shared.editor-heading3"),
      description: l("shared.editor-heading3Desc"),
      group: "text",
      keywords: ["h3", "heading"],
      run: (editor) => formatHeading(editor, "h3"),
    }),
    new SlashOption("bulleted", {
      feature: "list",
      label: l("shared.editor-bulletedList"),
      description: l("shared.editor-bulletedListDesc"),
      group: "list",
      keywords: ["unordered", "ul", "bullet"],
      run: formatBulletList,
    }),
    new SlashOption("numbered", {
      feature: "list",
      label: l("shared.editor-numberedList"),
      description: l("shared.editor-numberedListDesc"),
      group: "list",
      keywords: ["ordered", "ol", "number"],
      run: formatNumberedList,
    }),
    new SlashOption("todo", {
      feature: "list",
      label: l("shared.editor-todoList"),
      description: l("shared.editor-todoListDesc"),
      group: "list",
      keywords: ["check", "checkbox", "todo"],
      run: formatCheckList,
    }),
  ];

  if (upload.canUpload) {
    options.push(
      new SlashOption("image", {
        feature: "image",
        label: l("shared.editor-image"),
        description: l("shared.editor-imageDesc"),
        group: "media",
        keywords: ["img", "photo", "picture"],
        run: (editor) => openFilePicker("image/*", (file) => void insertUploaded(editor, upload, file, "image")),
      }),
      new SlashOption("video", {
        feature: "video",
        label: l("shared.editor-video"),
        description: l("shared.editor-videoDesc"),
        group: "media",
        keywords: ["movie", "mp4", "clip"],
        run: (editor) => openFilePicker("video/*", (file) => void insertUploaded(editor, upload, file, "video")),
      }),
      new SlashOption("file", {
        feature: "file",
        label: l("shared.editor-file"),
        description: l("shared.editor-fileDesc"),
        group: "media",
        keywords: ["attachment", "document", "pdf"],
        run: (editor) =>
          openFilePicker(upload.policy.accept, (file) => void insertUploaded(editor, upload, file, "file")),
      }),
    );
  }

  options.push(
    new SlashOption("embed", {
      feature: "embed",
      label: l("shared.editor-embed"),
      description: l("shared.editor-embedDesc"),
      group: "media",
      keywords: ["youtube", "vimeo", "iframe", "video"],
      run: (editor) => insertEmbed(editor, {}),
    }),
    new SlashOption("excalidraw", {
      feature: "excalidraw",
      label: l("shared.editor-excalidraw"),
      description: l("shared.editor-excalidrawDesc"),
      group: "media",
      keywords: ["draw", "diagram", "sketch", "whiteboard"],
      run: (editor) => insertExcalidraw(editor, {}),
    }),
    new SlashOption("mermaid", {
      feature: "mermaid",
      label: l("shared.editor-mermaid"),
      description: l("shared.editor-mermaidDesc"),
      group: "media",
      keywords: ["diagram", "flowchart", "sequence", "graph", "chart", "uml", "gantt"],
      run: (editor) => insertMermaid(editor),
    }),
    new SlashOption("table", {
      feature: "table",
      label: l("shared.editor-table"),
      description: l("shared.editor-tableDesc"),
      group: "structure",
      keywords: ["grid", "row", "column", "cell"],
      run: (editor) => insertTable(editor),
    }),
    new SlashOption("accordion", {
      feature: "collapsible",
      label: l("shared.editor-toggle"),
      description: l("shared.editor-toggleDesc"),
      group: "structure",
      keywords: ["accordion", "collapsible", "details", "expand", "fold"],
      run: (editor) => insertCollapsible(editor),
    }),
    new SlashOption("callout", {
      feature: "callout",
      label: l("shared.editor-callout"),
      description: l("shared.editor-calloutDesc"),
      group: "structure",
      keywords: ["note", "info", "warning", "admonition"],
      run: (editor) => formatCallout(editor, "info"),
    }),
    new SlashOption("quote", {
      feature: "quote",
      label: l("shared.editor-quote"),
      description: l("shared.editor-quoteDesc"),
      group: "structure",
      keywords: ["blockquote", "citation"],
      run: formatQuote,
    }),
    new SlashOption("code", {
      feature: "code",
      label: l("shared.editor-code"),
      description: l("shared.editor-codeDesc"),
      group: "structure",
      keywords: ["codeblock", "snippet", "pre"],
      run: formatCode,
    }),
    new SlashOption("divider", {
      feature: "divider",
      label: l("shared.editor-divider"),
      description: l("shared.editor-dividerDesc"),
      group: "structure",
      keywords: ["hr", "line", "separator", "rule"],
      run: insertDivider,
    }),
  );

  for (const source of mentionSources) {
    options.push(
      new SlashOption(`mention:${source.refName}`, {
        feature: "mention",
        label: source.label,
        description: l("shared.editor-mentionDesc", { label: source.label }),
        group: "reference",
        keywords: [source.refName, "mention", ...(source.keywords ?? [])],
        run: (editor) => openMentionSource(editor, source),
      }),
    );
  }

  for (const option of extraOptions) {
    options.push(
      new SlashOption(option.key, {
        label: option.label,
        description: option.description,
        group: option.group ?? "structure",
        keywords: option.keywords,
        run: option.run,
      }),
    );
  }

  return options.filter((option) => !option.feature || features.has(option.feature));
};

/** Case-insensitive match against label + keywords. */
export const matchesQuery = (option: SlashOption, query: string) => {
  const q = query.toLowerCase();
  if (option.label.toLowerCase().includes(q)) return true;
  return option.keywords.some((keyword) => keyword.includes(q));
};
