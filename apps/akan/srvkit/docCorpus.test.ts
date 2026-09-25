import { describe, expect, test } from "bun:test";
import path from "node:path";
import { DocCorpus } from "./docCorpus";

/**
 * Read against the real generated corpus rather than a fixture, because what this parser is coupled to is the
 * exact header `generateLlms.ts` writes. A fixture would keep passing after the generator changed shape, which is
 * the one failure worth catching here.
 */
process.env.AKAN_APP_DIR = path.resolve(import.meta.dir, "..");
const entries = await new DocCorpus().entries();

describe("DocCorpus", () => {
  test("reads every generated page", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(new Set(entries.map((entry) => entry.href)).size).toBe(entries.length);
  });

  test("fills every header field the generator writes", () => {
    expect(entries.filter((entry) => !entry.title)).toEqual([]);
    expect(entries.filter((entry) => !entry.section)).toEqual([]);
    expect(entries.filter((entry) => !entry.priority)).toEqual([]);
    // The four sections the docs app is organized into; a fifth means the scalar's enum is now out of date.
    expect([...new Set(entries.map((entry) => entry.section))].sort()).toEqual([
      "cheatsheet",
      "conventions",
      "docs",
      "references",
    ]);
    expect([...new Set(entries.map((entry) => entry.priority))].sort()).toEqual(["P0", "P1", "P2"]);
  });

  test("summarizes with prose rather than with the title again", () => {
    // `## Content` opens by repeating the page title, so the literal first paragraph is the one thing a list
    // result already shows. Every page must summarize as something else.
    expect(entries.filter((entry) => !entry.summary)).toEqual([]);
    expect(entries.filter((entry) => entry.summary === entry.title)).toEqual([]);
    const signal = entries.find((entry) => entry.href === "/references/akanjs/signal");
    expect(signal?.summary).toContain("Guard classes");
  });

  test("keeps the full page as the body, code examples included", () => {
    const quickstart = entries.find((entry) => entry.href === "/docs/intro/quickstart");
    expect(quickstart?.body).toContain("## Content");
    expect(quickstart?.body).toContain("## Code Examples");
  });

  test("serves an empty corpus rather than throwing when the docs were never generated", async () => {
    process.env.AKAN_APP_DIR = path.join(import.meta.dir, "no-such-app");
    try {
      expect(await new DocCorpus().entries()).toEqual([]);
    } finally {
      process.env.AKAN_APP_DIR = path.resolve(import.meta.dir, "..");
    }
  });
});
