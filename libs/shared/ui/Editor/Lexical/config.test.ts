import { beforeAll, describe, expect, test } from "bun:test";
import {
  $getRoot,
  $parseSerializedNode,
  createEditor,
  type Klass,
  type LexicalNode,
  type SerializedEditorState,
  type SerializedLexicalNode,
} from "lexical";

import { RichMarkdownReader } from "../../../common/richMarkdownReader";
import { RichNode } from "../../../common/richNode";

// `./config` reaches the client barrel (excalidrawNode.util imports `Err`), which reads getEnv() at module
// scope, so the import has to happen after these are set — hence the dynamic import below.
process.env.AKAN_PUBLIC_APP_NAME ??= "test";
process.env.AKAN_PUBLIC_REPO_NAME ??= "test";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";
process.env.AKAN_PUBLIC_ENV ??= "local";
process.env.AKAN_PUBLIC_OPERATION_MODE ??= "local";

describe("registered editor nodes", () => {
  let nodes: readonly Klass<LexicalNode>[];
  beforeAll(async () => {
    ({ akanEditorNodes: nodes } = await import("./config"));
  });

  const ownKeysOf = () => {
    const editor = createEditor({ namespace: "test", nodes: [...nodes], onError: () => {} });
    const keysOf = new Map<string, string[]>();
    const broken: string[] = [];
    editor.update(
      () => {
        for (const klass of nodes) {
          try {
            keysOf.set(klass.name, Object.keys(new (klass as unknown as new () => object)()));
          } catch (error) {
            broken.push(`${klass.name}: ${(error as Error).message}`);
          }
        }
      },
      { discrete: true },
    );
    return { keysOf, broken };
  };

  test("every node survives `new klass()`, which is how @lexical/yjs learns what to sync", () => {
    expect(ownKeysOf().broken).toEqual([]);
  });

  test("every registered node may travel as an akan-node island, so markdown can carry what it cannot spell", () => {
    const missing = nodes.map((klass) => klass.getType()).filter((type) => !RichMarkdownReader.islandTypes.has(type));
    expect(missing).toEqual([]);
  });

  test("a default-constructed node still declares every field it stores", () => {
    const { keysOf } = ownKeysOf();
    expect(keysOf.get("ImageNode")).toContain("__src");
    expect(keysOf.get("ImageNode")).toContain("__fileId");
    expect(keysOf.get("ExcalidrawNode")).toContain("__scene");
    expect(keysOf.get("MentionNode")).toContain("__refId");
    expect(keysOf.get("MermaidNode")).toContain("__code");
    expect(keysOf.get("VideoNode")).toContain("__src");
    expect(keysOf.get("FileNode")).toContain("__name");
    expect(keysOf.get("EmbedNode")).toContain("__embedUrl");
  });

  test("every built-in node type is one the read-only renderer may assume is registered", () => {
    const missing = nodes.map((klass) => klass.getType()).filter((type) => !RichNode.editorTypes.has(type));
    expect(missing).toEqual([]);
  });

  // The agent's write path hands these straight to `$parseSerializedNode`: a shape the reader gets wrong for
  // a node would fail the whole write, not just that block.
  test("every block the markdown reader produces parses in a live editor", () => {
    const markdown = [
      "# Title",
      "Para with **bold**, `code`, [link](https://a.com), <https://b.com> and @[Kim](mention:user/u1).",
      "> quote",
      "- one\n  - nested\n- [x] task",
      "1. first",
      "```ts\nconst a = 1;\n```",
      "```mermaid\ngraph TD\n  A-->B\n```",
      "---",
      "![alt](https://a.com/i.png)",
      "| a | b |\n| --- | --- |\n| 1 | 2 |",
      '<table>\n<tr><th colspan="2">h</th></tr>\n<tr><td data-bg="#fff">c</td><td>d</td></tr>\n</table>',
      '```akan-node\n{"type":"akan-callout","version":1,"variant":"warning","children":[{"type":"text","version":1,"text":"careful"}]}\n```',
    ].join("\n\n");
    const editor = createEditor({
      namespace: "test",
      nodes: [...nodes],
      onError: (error) => {
        throw error;
      },
    });
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        for (const block of RichMarkdownReader.read(markdown).root.children)
          root.append($parseSerializedNode(block as SerializedLexicalNode));
      },
      { discrete: true },
    );
    const types = editor
      .getEditorState()
      .toJSON()
      .root.children.map((block) => block.type);
    expect(types).toEqual([
      "heading",
      "paragraph",
      "quote",
      "list",
      "list",
      "list",
      "code",
      "akan-mermaid",
      "horizontalrule",
      "akan-image",
      "table",
      "table",
      "akan-callout",
    ]);
  });

  test("a toggle and a callout keep their alignment and indent across a save and a load", () => {
    const editor = createEditor({
      namespace: "test",
      nodes: [...nodes],
      onError: (error) => {
        throw error;
      },
    });
    const block = (type: string, children: unknown[], extra: object = {}) => ({
      type,
      version: 1,
      direction: null,
      format: "center",
      indent: 1,
      children,
      ...extra,
    });
    const paragraph = block("paragraph", [{ type: "text", version: 1, text: "body" }]);
    const json = {
      root: {
        type: "root",
        version: 1,
        direction: null,
        format: "",
        indent: 0,
        children: [
          block(
            "akan-collapsible",
            [block("akan-collapsible-title", []), block("akan-collapsible-content", [paragraph])],
            { open: true },
          ),
          block("akan-callout", [paragraph], { variant: "warning" }),
        ],
      },
    };
    const reloaded = editor.parseEditorState(json as unknown as SerializedEditorState).toJSON().root.children as {
      format?: string;
      indent?: number;
      children?: { format?: string; indent?: number }[];
    }[];
    expect(reloaded.map(({ format, indent }) => ({ format, indent }))).toEqual([
      { format: "center", indent: 1 },
      { format: "center", indent: 1 },
    ]);
    expect(reloaded[0].children?.map(({ format, indent }) => ({ format, indent }))).toEqual([
      { format: "center", indent: 1 },
      { format: "center", indent: 1 },
    ]);
  });
});
