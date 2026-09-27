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

import type { EditorContent } from "./richEditor";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownWriter } from "./richMarkdownWriter";

/**
 * A rich-text field: a Lexical document on the wire and in storage, markdown to an agent.
 *
 * A string is markdown wherever it enters — an agent's argument, a script's fetch, a server-side create — and is read
 * into the document on the spot, so storage only ever receives the document. An object passes through, including what
 * is already stored — `[]`, the legacy block map — because refusing it here would fail the hydration of every old row
 * that holds one, not just its next write.
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
      description:
        "Markdown: CommonMark plus GFM tables, `- [ ]` tasks, ==highlight== and @[label](mention:model/id). Keep every ```akan-node block and <table> exactly as read — they carry what markdown cannot.",
    },
    read: (value) => RichMarkdownWriter.write(value),
  };

  static override validate(value: PrimitiveValue) {
    return typeof value === "string" || (!!value && typeof value === "object");
  }

  static override parseValue(input: string | EditorContent): EditorContent {
    return typeof input === "string" ? RichMarkdownReader.read(input) : input;
  }

  static override serializeValue(value: string | EditorContent): EditorContent {
    return typeof value === "string" ? RichMarkdownReader.read(value) : value;
  }
}
PrimitiveRegistry.register(RichText);
