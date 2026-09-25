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
import { insertEmbed, insertExcalidraw, insertFile, insertImage, insertVideo } from "../media";
import type { EditorSlashOption } from "../plugin";
import type { EditorUpload } from "../UploadContext";
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

/**
 * Builds the option set. Text/list/structure options are always present; the
 * upload-backed media options (image/video/file) appear only when uploads are
 * configured, while embed (URL-based) and callout are always available.
 * `extraOptions` are the entries contributed by the editor's `plugins`.
 */
export const buildOptions = (upload: EditorUpload, extraOptions: readonly EditorSlashOption[]): SlashOption[] => {
  const options: SlashOption[] = [
    new SlashOption("paragraph", {
      label: "Paragraph",
      description: "Plain text",
      group: "text",
      keywords: ["p", "text", "plain"],
      run: formatParagraph,
    }),
    new SlashOption("h1", {
      label: "Heading 1",
      description: "Big section heading",
      group: "text",
      keywords: ["title", "h1", "heading"],
      run: (editor) => formatHeading(editor, "h1"),
    }),
    new SlashOption("h2", {
      label: "Heading 2",
      description: "Medium section heading",
      group: "text",
      keywords: ["subtitle", "h2", "heading"],
      run: (editor) => formatHeading(editor, "h2"),
    }),
    new SlashOption("h3", {
      label: "Heading 3",
      description: "Small section heading",
      group: "text",
      keywords: ["h3", "heading"],
      run: (editor) => formatHeading(editor, "h3"),
    }),
    new SlashOption("bulleted", {
      label: "Bulleted list",
      description: "Create a simple bullet list",
      group: "list",
      keywords: ["unordered", "ul", "bullet"],
      run: formatBulletList,
    }),
    new SlashOption("numbered", {
      label: "Numbered list",
      description: "Create an ordered list",
      group: "list",
      keywords: ["ordered", "ol", "number"],
      run: formatNumberedList,
    }),
    new SlashOption("todo", {
      label: "Todo list",
      description: "Create a checklist",
      group: "list",
      keywords: ["check", "checkbox", "todo"],
      run: formatCheckList,
    }),
  ];

  if (upload.canUpload) {
    options.push(
      new SlashOption("image", {
        label: "Image",
        description: "Upload an image",
        group: "media",
        keywords: ["img", "photo", "picture"],
        run: (editor) =>
          openFilePicker("image/*", async (file) => {
            try {
              const uploaded = await upload.uploadFile(file, "image/*");
              const [width = 0, height = 0] = uploaded.imageSize ?? [];
              insertImage(editor, { fileId: uploaded.id, src: uploaded.url, alt: uploaded.filename, width, height });
            } catch (error) {
              upload.onError(error as Error);
            }
          }),
      }),
      new SlashOption("video", {
        label: "Video",
        description: "Upload a video",
        group: "media",
        keywords: ["movie", "mp4", "clip"],
        run: (editor) =>
          openFilePicker("video/*", async (file) => {
            try {
              const uploaded = await upload.uploadFile(file, "video/*");
              const [width = 0, height = 0] = uploaded.imageSize ?? [];
              insertVideo(editor, { fileId: uploaded.id, src: uploaded.url, width, height });
            } catch (error) {
              upload.onError(error as Error);
            }
          }),
      }),
      new SlashOption("file", {
        label: "File",
        description: "Upload a file",
        group: "media",
        keywords: ["attachment", "document", "pdf"],
        run: (editor) =>
          openFilePicker(upload.policy.accept, async (file) => {
            try {
              const uploaded = await upload.uploadFile(file);
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
          }),
      }),
    );
  }

  options.push(
    new SlashOption("embed", {
      label: "Embed",
      description: "Embed a YouTube / Vimeo URL",
      group: "media",
      keywords: ["youtube", "vimeo", "iframe", "video"],
      run: (editor) => insertEmbed(editor, {}),
    }),
    new SlashOption("excalidraw", {
      label: "Excalidraw",
      description: "Draw a diagram",
      group: "media",
      keywords: ["draw", "diagram", "sketch", "whiteboard"],
      run: (editor) => insertExcalidraw(editor, {}),
    }),
    new SlashOption("table", {
      label: "Table",
      description: "Insert a 3×3 table",
      group: "structure",
      keywords: ["grid", "row", "column", "cell"],
      run: (editor) => insertTable(editor),
    }),
    new SlashOption("accordion", {
      label: "Toggle",
      description: "Collapsible accordion section",
      group: "structure",
      keywords: ["accordion", "collapsible", "details", "expand", "fold"],
      run: (editor) => insertCollapsible(editor),
    }),
    new SlashOption("callout", {
      label: "Callout",
      description: "Add a highlighted note",
      group: "structure",
      keywords: ["note", "info", "warning", "admonition"],
      run: (editor) => formatCallout(editor, "info"),
    }),
    new SlashOption("quote", {
      label: "Quote",
      description: "Add a quote",
      group: "structure",
      keywords: ["blockquote", "citation"],
      run: formatQuote,
    }),
    new SlashOption("code", {
      label: "Code",
      description: "Add a code block",
      group: "structure",
      keywords: ["codeblock", "snippet", "pre"],
      run: formatCode,
    }),
    new SlashOption("divider", {
      label: "Divider",
      description: "Separate content",
      group: "structure",
      keywords: ["hr", "line", "separator", "rule"],
      run: insertDivider,
    }),
  );

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

  return options;
};

/** Case-insensitive match against label + keywords. */
export const matchesQuery = (option: SlashOption, query: string) => {
  const q = query.toLowerCase();
  if (option.label.toLowerCase().includes(q)) return true;
  return option.keywords.some((keyword) => keyword.includes(q));
};
