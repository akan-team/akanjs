import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BuildCacheStamp } from "./buildCacheStamp";
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

  test("keeps Tailwind's important mark on the candidate, leading or trailing, and reads code's `!` as code", async () => {
    const candidates = await scan(
      `const c = "h-0! w-0! !h-0 md:!w-1 md:w-1! -mt-2! !-mt-2 w-[10px]!"; if (a !== b && x!==y) ref!.focus();`,
    );
    expect(candidates).toEqual(
      expect.arrayContaining(["h-0!", "w-0!", "!h-0", "md:!w-1", "md:w-1!", "-mt-2!", "!-mt-2", "w-[10px]!"]),
    );
    expect(candidates).toEqual(expect.arrayContaining(["a", "b", "x", "y", "ref", "focus"]));
    expect(candidates).not.toContain("h-0");
    expect(candidates).not.toContain("x!");
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
  const writeCache = async (stamp: BuildCacheStamp) => {
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
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" });
    const cache = await new CssCandidateCache(cachePath, { akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" }).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([1, 0]);
  });

  test.each([
    ["akanjs", { akanjs: "1.0.1", bun: "1.0.0+a", code: "1:1" }],
    ["Bun", { akanjs: "1.0.0", bun: "1.0.0+b", code: "1:1" }],
    ["scanner build", { akanjs: "1.0.0", bun: "1.0.0+a", code: "2:1" }],
  ])("rescans an entry another %s wrote", async (_, stamp) => {
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" });
    const cache = await new CssCandidateCache(cachePath, stamp).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([0, 1]);
  });

  test("keeps another base path's entries, so each base path reuses its scan on the next start", async () => {
    const stamp = { akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" };
    const dir = await mkdtemp(path.join(tmpdir(), "css-candidate-"));
    const cachePath = path.join(dir, "cache.json");
    const [rootFile, adminFile] = [path.join(dir, "root.tsx"), path.join(dir, "admin.tsx")];
    await writeFile(rootFile, `const c = "w-full";`);
    await writeFile(adminFile, `const c = "h-full";`);
    const scanBasePath = async (file: string) => {
      const cache = await new CssCandidateCache(cachePath, stamp).load();
      await cache.candidatesFor(file);
      await cache.save(new Set([file]));
      return cache;
    };
    await scanBasePath(rootFile);
    await scanBasePath(adminFile);

    const [root, admin] = [await scanBasePath(rootFile), await scanBasePath(adminFile)];
    expect([root.reused, admin.reused]).toEqual([1, 1]);
  });

  test("drops the entry of a source file that was deleted", async () => {
    const stamp = { akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" };
    const { file, cachePath } = await writeCache(stamp);
    await rm(file);
    await new CssCandidateCache(cachePath, stamp).load().then((cache) => cache.save(new Set()));
    expect(Object.keys((await Bun.file(cachePath).json()).files)).toEqual([]);
  });

  test("rescans when the cache file was cut short", async () => {
    const { file, cachePath } = await writeCache({ akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" });
    const text = await Bun.file(cachePath).text();
    await writeFile(cachePath, text.slice(0, text.length / 2));
    const cache = await new CssCandidateCache(cachePath, { akanjs: "1.0.0", bun: "1.0.0+a", code: "1:1" }).load();
    expect(await cache.candidatesFor(file)).toContain("w-full");
    expect([cache.reused, cache.rescanned]).toEqual([0, 1]);
  });
});
