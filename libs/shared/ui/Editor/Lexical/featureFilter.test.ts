import { describe, expect, it } from "bun:test";
import { RichMarkdownReader } from "@libs/shared/common";

import type { EditorFeature } from "./feature";
import { FeatureFilter } from "./featureFilter";

// Keys alone: the filter reads `key` and `nodeType`, never the transformers `markdown.ts` attaches.
const featuresOf = (...keys: NonNullable<EditorFeature["key"]>[]): EditorFeature[] => keys.map((key) => ({ key }));
const blocksOf = (markdown: string, features: EditorFeature[]) =>
  FeatureFilter.blocks(RichMarkdownReader.read(markdown).root.children, FeatureFilter.allowanceOf(features));
const typesOf = (nodes: { type?: string; children?: unknown[] }[]): unknown[] =>
  nodes.map((node) => (node.children?.length ? [node.type, typesOf(node.children as typeof nodes)] : node.type));

describe("FeatureFilter", () => {
  it("keeps everything for a field that offers everything", () => {
    const all = featuresOf("heading", "list", "emphasis", "link", "mention", "table", "image");
    expect(typesOf(blocksOf("# Title\n\n- **one** [x](https://a.com)", all))).toEqual([
      ["heading", ["text"]],
      ["list", [["listitem", ["text", "text", ["link", ["text"]]]]]],
    ]);
  });

  it("reads a block the field cannot hold as the paragraph a person could have typed there", () => {
    const blocks = blocksOf("# Title\n\n> quoted\n\n- one\n- two\n\n```\ncode\n```", featuresOf("mention"));
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(JSON.stringify(blocks)).toContain('"text":"Title"');
    expect(JSON.stringify(blocks)).toContain('"text":"two"');
  });

  it("drops a format the field has no feature for, and keeps the text", () => {
    const [paragraph] = blocksOf("**bold** and `code`", featuresOf("mention"));
    const children = paragraph.children as { text?: string; format?: number }[];
    expect(children.map((child) => child.format)).toEqual([0, 0, 0]);
    expect(children.map((child) => child.text).join("")).toBe("bold and code");
  });

  it("keeps a link's text where the field has no links, and a mention's label where it has no mentions", () => {
    const [paragraph] = blocksOf("see [docs](https://a.com) and @[Kim](mention:user/u1)", featuresOf());
    const children = paragraph.children as { type?: string; text?: string }[];
    expect(children.every((child) => child.type === "text")).toBe(true);
    expect(children.map((child) => child.text).join("")).toBe("see docs and Kim");
  });

  it("leaves out a node with no text and no feature, and a node no plugin here registers", () => {
    const pageBlock = '```akan-node\n{"type":"akan-page-block","version":1,"pageBlockId":"p1"}\n```';
    expect(blocksOf(`![a](https://a.com/i.png)\n\n---\n\n${pageBlock}\n\nkept`, featuresOf()).length).toBe(1);
    const withPages: EditorFeature[] = [{ nodeType: "akan-page-block", label: "nested page" }];
    expect(blocksOf(pageBlock, withPages).map((block) => block.type)).toEqual(["akan-page-block"]);
  });

  it("flattens a table into its cells' paragraphs where the field has no tables", () => {
    const blocks = blocksOf("| a | b |\n| --- | --- |\n| 1 | 2 |", featuresOf());
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"]);
  });

  it("keeps a diagram's source as a code fence where the field has code but no diagrams", () => {
    const [block] = blocksOf("```mermaid\ngraph TD\n  A-->B\n```", featuresOf("code"));
    expect(block).toMatchObject({ type: "code", language: "mermaid" });
  });

  it("splits a newline in text into a line break, which is how a paragraph holds one", () => {
    const [paragraph] = blocksOf("```\na\nb\n```", featuresOf());
    expect(typesOf(paragraph.children as { type?: string }[])).toEqual(["text", "linebreak", "text"]);
  });

  it("fills a kept mention's link and avatar from what a mention source resolved", () => {
    const [paragraph] = FeatureFilter.blocks(
      RichMarkdownReader.read("cc @[Kim](mention:user/u1)").root.children,
      FeatureFilter.allowanceOf(featuresOf("mention")),
      (refName, refId) => (refName === "user" && refId === "u1" ? { href: "/user/u1", imageUrl: null } : undefined),
    );
    expect(paragraph.children?.[1]).toMatchObject({ type: "akan-mention", refId: "u1", href: "/user/u1" });
  });

  it("keeps pasted inline nodes inline, so a paste mid-sentence stays in that sentence", () => {
    const pasted = [
      { type: "text", version: 1, text: "plain ", format: 1 },
      { type: "link", version: 1, url: "https://a.com", children: [{ type: "text", version: 1, text: "site" }] },
      { type: "table", version: 1, children: [] },
    ];
    const kept = FeatureFilter.nodes(pasted, FeatureFilter.allowanceOf(featuresOf("mention")));
    expect(kept.map((node) => node.type)).toEqual(["text", "text"]);
    expect(kept.map((node) => node.text).join("")).toBe("plain site");
  });

  it("drops what is not a node", () => {
    expect(FeatureFilter.blocks([null, 3, "x"], FeatureFilter.allowanceOf([]))).toEqual([]);
  });
});
