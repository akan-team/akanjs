import { describe, expect, test } from "bun:test";
import path from "node:path";

const vendor = (name: string) => path.join(import.meta.dir, "vendor", `${name}.ts`);
const shellEntries = [
  path.join(import.meta.dir, "rscClient.tsx"),
  path.join(import.meta.dir, "rscSegmentOutlet.tsx"),
  ...["akanjs-base", "akanjs-common", "akanjs-client", "akanjs-fetch", "akanjs-constant"].map(vendor),
];
const storeEntries = ["akanjs-store", "akanjs-store-agent"].map(vendor);
const isImmer = (input: string) => input.includes("/immer/");

//? Bun chunks a module by the set of entries reaching it, so every vendor is built at once, as in production.
const eagerInputsByEntry = async () => {
  const result = await Bun.build({
    entrypoints: [...shellEntries, ...storeEntries],
    target: "browser",
    format: "esm",
    splitting: true,
    metafile: true,
    throw: true,
    conditions: ["production"],
    external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "scheduler"],
  });
  const outputs = result.metafile?.outputs ?? {};
  const eagerFrom = (entry: string) => {
    const seen = new Set<string>();
    const load = (outputPath: string) => {
      if (seen.has(outputPath) || !outputs[outputPath]) return;
      seen.add(outputPath);
      for (const imp of outputs[outputPath].imports) if (imp.kind === "import-statement") load(imp.path);
    };
    for (const [outputPath, output] of Object.entries(outputs))
      if (output.entryPoint && path.resolve(output.entryPoint) === entry) load(outputPath);
    return [...seen].flatMap((outputPath) => Object.keys(outputs[outputPath]?.inputs ?? {}));
  };
  return new Map([...shellEntries, ...storeEntries].map((entry) => [entry, eagerFrom(entry)]));
};

describe("the vendors a store-less page loads", () => {
  test("leave immer to akanjs/store", async () => {
    const eager = await eagerInputsByEntry();
    expect(
      shellEntries.flatMap((entry) =>
        (eager.get(entry) ?? []).filter(isImmer).map((input) => `${path.basename(entry)} loads ${input}`),
      ),
    ).toEqual([]);
    expect(storeEntries.map((entry) => (eager.get(entry) ?? []).some(isImmer))).toEqual([true, true]);
  }, 60_000);
});
