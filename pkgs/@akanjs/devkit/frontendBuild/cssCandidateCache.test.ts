import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CssCandidateCache } from "./cssCandidateCache";

const scan = async (source: string) => {
  const dir = await mkdtemp(path.join(tmpdir(), "css-candidate-"));
  const file = path.join(dir, "probe.tsx");
  await writeFile(file, source);
  return await new CssCandidateCache(path.join(dir, "cache.json")).load().then((c) => c.candidatesFor(file));
};

describe("CssCandidateCache token extraction", () => {
  test("keeps plain utilities, variants and arbitrary values whole", async () => {
    const candidates = await scan(`const c = "w-full hover:bg-muted md:w-1/2 text-[#fff]";`);
    expect(candidates).toEqual(expect.arrayContaining(["w-full", "hover:bg-muted", "md:w-1/2", "text-[#fff]"]));
  });

  test("keeps an arbitrary variant that starts with a bracket", async () => {
    const candidates = await scan(`const c = "[&_td]:px-3 [&>*]:gap-2 [&_tbody_tr]:border-t";`);
    expect(candidates).toEqual(expect.arrayContaining(["[&_td]:px-3", "[&>*]:gap-2", "[&_tbody_tr]:border-t"]));
    expect(candidates).not.toContain("_td");
  });

  test("keeps a bracket nested one level inside another whole, rather than cutting it at the inner `]`", async () => {
    const candidates = await scan(
      `const c = "hidden [[data-theme=light]_&]:block has-[[aria-expanded=true]]:opacity-100 [&_[data-x]]:p-2 [&:has([data-state=open])]:p-1";`,
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        "[[data-theme=light]_&]:block",
        "has-[[aria-expanded=true]]:opacity-100",
        "[&_[data-x]]:p-2",
        "[&:has([data-state=open])]:p-1",
      ]),
    );
    expect(candidates).not.toContain("[[data-theme=light]_");
    expect(candidates).not.toContain("[&_[data-x]");
  });

  test("keeps Tailwind v4's variable shorthand whole, and leaves a call's argument its own candidate", async () => {
    const candidates = await scan(
      `const c = "max-md:top-(--keyboard-top) min-h-(--x) bg-(color:--brand)/50"; cn("flex"); fn(value);`,
    );
    expect(candidates).toEqual(
      expect.arrayContaining(["max-md:top-(--keyboard-top)", "min-h-(--x)", "bg-(color:--brand)/50", "flex"]),
    );
    expect(candidates).not.toContain("-keyboard-top");
  });

  test("ignores a labelled tuple type that only looks like an arbitrary property", async () => {
    const candidates = await scan(
      `type A = [key: string, make: () => unknown][];\ntype B = [setQueryArgs: (a: Args) => Args, options?: Policy];`,
    );
    expect(candidates.filter((candidate) => candidate.startsWith("["))).toEqual([]);
  });
});

describe("CssCandidateCache persistence", () => {
  const writeCache = async (stamp: { akanjs: string; bun: string }) => {
    const dir = await mkdtemp(path.join(tmpdir(), "css-candidate-"));
    const file = path.join(dir, "probe.tsx");
    const cachePath = path.join(dir, "cache.json");
    await writeFile(file, `const c = "w-full";`);
    const cache = await new CssCandidateCache(cachePath, stamp).load();
    await cache.candidatesFor(file);
    await cache.save(new Set([file]));
    return { file, cachePath };
  };

  test("reuses an entry the same akanjs and Bun wrote", async () => {
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a" });
    const cache = await new CssCandidateCache(cachePath, { akanjs: "1.0.0", bun: "1.0.0+a" }).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([1, 0]);
  });

  test.each([
    ["akanjs", { akanjs: "1.0.1", bun: "1.0.0+a" }],
    ["Bun", { akanjs: "1.0.0", bun: "1.0.0+b" }],
  ])("rescans an entry another %s version wrote", async (_, stamp) => {
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a" });
    const cache = await new CssCandidateCache(cachePath, stamp).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([0, 1]);
  });

  test("rescans when the cache file was cut short", async () => {
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a" });
    const text = await Bun.file(cachePath).text();
    await writeFile(cachePath, text.slice(0, text.length / 2));
    const cache = await new CssCandidateCache(cachePath, { akanjs: "1.0.0", bun: "1.0.0+a" }).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([0, 1]);
  });
});
