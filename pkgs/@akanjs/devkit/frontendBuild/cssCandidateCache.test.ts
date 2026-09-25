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

  // A candidate that opens with `[` used to be torn into `_td` + `px-3`, so every descendant-variant
  // rule in the framework compiled to nothing and its element rendered unstyled with no diagnostic.
  test("keeps an arbitrary variant that starts with a bracket", async () => {
    const candidates = await scan(`const c = "[&_td]:px-3 [&>*]:gap-2 [&_tbody_tr]:border-t";`);
    expect(candidates).toEqual(expect.arrayContaining(["[&_td]:px-3", "[&>*]:gap-2", "[&_tbody_tr]:border-t"]));
    expect(candidates).not.toContain("_td");
  });

  // A labelled tuple type looks like an arbitrary property, and compiles to a rule whose declaration is
  // TypeScript. `optimize()` cannot parse that, and drops far more than the offending rule on its way
  // out — every variant in the build went missing, so nothing hovered, focused or responded to a
  // breakpoint. Tailwind writes a space in an arbitrary value as `_`, so whitespace rules the token out.
  test("ignores a labelled tuple type that only looks like an arbitrary property", async () => {
    const candidates = await scan(
      `type A = [key: string, make: () => unknown][];\ntype B = [setQueryArgs: (a: Args) => Args, options?: Policy];`,
    );
    expect(candidates.filter((candidate) => candidate.startsWith("["))).toEqual([]);
  });
});
