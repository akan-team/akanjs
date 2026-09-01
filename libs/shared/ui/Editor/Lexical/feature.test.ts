import { describe, expect, it } from "bun:test";
import type { Transformer } from "@lexical/markdown";
import { type EditorFeature, type EditorNodeLike, lossesOf, syntaxOf, transformersOf } from "./feature";

// The real table lives in `markdown.ts`, which reaches MermaidNode → `@libs/util/ui` → the util store
// and cannot be imported here. These fixtures stand in for it; what is under test is the derivation.
const transformerOf = (name: string) => ({ type: "element", regExp: new RegExp(name) }) as unknown as Transformer;

const HEADING = transformerOf("heading");
const QUOTE = transformerOf("quote");
const BOLD = transformerOf("bold");

const features: EditorFeature[] = [
  { nodeType: "heading", transformers: [HEADING], syntax: "`#` headings" },
  { nodeType: "quote", transformers: [QUOTE], syntax: "`>` quotes" },
  { transformers: [BOLD], syntax: "**bold**" },
  { nodeType: "akan-image", label: "image" },
  { nodeType: "table", label: "table" },
];

describe("editor features", () => {
  describe("transformersOf", () => {
    it("flattens in declaration order, which is what settles a tie between two transformers", () => {
      expect(transformersOf(features)).toEqual([HEADING, QUOTE, BOLD]);
    });

    it("is empty for a table of pure losses", () => {
      expect(transformersOf([{ nodeType: "akan-image", label: "image" }])).toEqual([]);
    });
  });

  describe("lossesOf", () => {
    it("names only what no transformer carries", () => {
      expect(lossesOf(features)).toEqual({ "akan-image": { label: "image" }, table: { label: "table" } });
    });

    it("cannot report a carried feature as a loss even when it also carries a label", () => {
      expect(lossesOf([{ nodeType: "quote", label: "quote", transformers: [QUOTE] }])).toEqual({});
    });

    it("keeps a carried feature that narrows its loss, so a merged table cell is still reported", () => {
      const when = (node: EditorNodeLike) => node.type === "table";
      expect(
        lossesOf([{ nodeType: "table", label: "merged table cell", transformers: [QUOTE], lossyWhen: when }]),
      ).toEqual({ table: { label: "merged table cell", when } });
    });

    it("skips a text format, which is no node of its own", () => {
      expect(lossesOf([{ label: "emphasis" }])).toEqual({});
    });

    it("lets a later feature override an earlier one of the same node type", () => {
      const overridden = lossesOf([
        { nodeType: "akan-image", label: "image" },
        { nodeType: "akan-image", label: "picture" },
      ]);
      expect(overridden).toEqual({ "akan-image": { label: "picture" } });
    });
  });

  describe("syntaxOf", () => {
    it("joins the clauses of every carried feature", () => {
      expect(syntaxOf(features)).toBe("`#` headings, `>` quotes, **bold**");
    });

    it("leaves out a clause on a feature nothing carries", () => {
      expect(syntaxOf([{ nodeType: "table", label: "table", syntax: "`| a |` tables" }])).toBe("");
    });
  });
});
