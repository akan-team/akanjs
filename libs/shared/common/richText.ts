import {
  CLIENT_VALUE,
  DEFAULT_VALUE,
  EXAMPLE_VALUE,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  type PrimitiveValue,
  SERVER_VALUE,
} from "akanjs/base";

import { type EditorContent, RichEditor } from "./richEditor";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownWriter } from "./richMarkdownWriter";
import { RichNode } from "./richNode";
import { RichSanitizer } from "./richSanitizer";

/**
 * A rich-text field: a Lexical document on the wire and in storage, markdown to an agent.
 *
 * A string is markdown wherever it enters — an agent's argument, a script's fetch, a server-side create — and is read
 * into the document on the spot, so storage only ever receives the document. Every document is run through
 * `RichSanitizer` on the way in and on the way to storage, which is where a url a node may not carry is dropped.
 *
 * What old rows hold — `[]`, a legacy block map — still passes, because refusing it would fail the hydration of every
 * row that holds one, not just its next write. A value that claims to be a document and is not is refused on a write
 * and read back as its text on a load, which is what the editor would have shown of it.
 */
export class RichText extends PrimitiveScalar {
  static override refName: "RichText" = "RichText";
  static override [SERVER_VALUE]: EditorContent;
  static override [CLIENT_VALUE]: EditorContent;
  static override [DEFAULT_VALUE]: EditorContent = RichMarkdownReader.read("");
  static override [EXAMPLE_VALUE] = "## Title\n\nBody with **bold** text.";
  static override jsonSchema = { type: "object", description: "A Lexical editor state" };
  static override agent: PrimitiveAgentFace<EditorContent> = {
    schema: {
      type: "string",
      contentMediaType: "text/markdown",
      description: [
        "Markdown, in this dialect: `#` to `######` headings, `>` quotes, `-` and `1.` lists nested by indentation,",
        "`- [ ]` / `- [x]` tasks, ``` fences (```mermaid draws a diagram), `---` rules, `![alt](url)` on a line of its",
        "own, GFM pipe tables; inline `**bold**`, `*italic*` or `_italic_`, `~~strike~~`, `==highlight==`, `` `code` ``,",
        '`[text](url "title")`, `<https://url>`, backslash escapes and @[label](mention:model/id).',
        "Not read: `__bold__`, underlined (setext) headings, images inside a sentence, urls holding spaces or",
        "parentheses, raw HTML other than <br> and the tables written here.",
        "Keep every ```akan-node block and <table> exactly as read — they carry what markdown cannot.",
      ].join(" "),
    },
    read: (value) => RichMarkdownWriter.write(value),
  };

  static override validate(value: PrimitiveValue) {
    if (typeof value === "string") return true;
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.every(RichNode.isNode);
    return !("root" in value) || RichNode.isDocument(value);
  }

  static override parseValue(input: string | EditorContent): EditorContent {
    if (typeof input === "string") return RichSanitizer.sanitize(RichMarkdownReader.read(input));
    if (input && typeof input === "object" && "root" in input && !RichNode.isDocument(input)) {
      const text = RichEditor.extractTextFromContent(input);
      return text.trim() ? RichEditor.contentFromText(text) : RichMarkdownReader.read("");
    }
    return RichSanitizer.sanitize(input);
  }

  static override serializeValue(value: string | EditorContent): EditorContent {
    return RichSanitizer.sanitize(typeof value === "string" ? RichMarkdownReader.read(value) : value);
  }
}
PrimitiveRegistry.register(RichText);
