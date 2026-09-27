import { beforeAll, describe, expect, test } from "bun:test";
import { createEditor, type Klass, type LexicalNode } from "lexical";

import { RichMarkdownReader } from "../../../common/richMarkdownReader";

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
    ({ AKAN_EDITOR_NODES: nodes } = await import("./config"));
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
});
