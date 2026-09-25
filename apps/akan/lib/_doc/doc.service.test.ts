import { describe, expect, test } from "bun:test";
import { DocCorpus } from "@apps/akan/srvkit";
import { DocService } from "./doc.service";

// Built by string rather than with `node:path`, which a module file may not import.
process.env.AKAN_APP_DIR = `${import.meta.dir}/../..`;

/**
 * `plug()` is filled by the DI container at boot, so the adapter is handed over directly here. The corpus it reads
 * is the real one — ranking is only meaningful against the actual page set, and a fixture would let the ranking
 * drift from what an agent actually gets.
 */
const service = () => {
  const built = new DocService();
  Object.defineProperty(built, "corpus", { value: new DocCorpus() });
  return built;
};

describe("DocService list", () => {
  test("lists everything, or one section", async () => {
    const all = await service().listPages();
    expect(all.length).toBeGreaterThan(100);
    const docs = await service().listPages("docs");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.length).toBeLessThan(all.length);
    expect(docs.every((page) => page.section === "docs")).toBe(true);
  });
});

describe("DocService search", () => {
  test("puts the page named for the query above the ones that merely mention it", async () => {
    // Dozens of pages say "signal"; one is the reference for it, and that is the answer.
    const hits = await service().searchPages("signal");
    expect(hits[0]?.href).toBe("/references/akanjs/signal");
  });

  test("narrows on each added word rather than widening", async () => {
    const one = await service().searchPages("store", 100);
    const two = await service().searchPages("store action", 100);
    expect(two.length).toBeLessThan(one.length);
    expect(two.every((page) => one.some((candidate) => candidate.href === page.href))).toBe(true);
  });

  test("matches nothing on a blank query instead of listing everything", async () => {
    // A search endpoint that treats empty input as a passthrough is a full listing wearing a filter's name.
    expect(await service().searchPages("")).toEqual([]);
    expect(await service().searchPages("   ")).toEqual([]);
  });

  test("honours the limit and defaults to twenty", async () => {
    expect((await service().searchPages("the", 3)).length).toBeLessThanOrEqual(3);
    expect((await service().searchPages("the")).length).toBeLessThanOrEqual(20);
  });

  test("returns choosable summaries rather than whole pages", async () => {
    const [first] = await service().searchPages("cascade");
    expect(first?.summary).toBeTruthy();
    expect(first?.summary).not.toBe(first?.title);
  });
});
