import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { ModuleParts } from "./moduleParts";
import { PartModules, type PartSource } from "./partModules";

const makeTempRoot = tempDirs("akan-part-modules-");

describe("PartModules", () => {
  test.each([
    ["apps/demo/ui/Card.tsx", true],
    ["libs/kit/webkit/useThing.ts", true],
    ["apps/demo/lib/memo/Memo.Zone.tsx", true],
    ["apps/demo/page/[lang]/_index.tsx", true],
    ["apps/demo/lib/memo/memo.store.ts", false],
    ["apps/demo/lib/memo/memo.constant.ts", false],
    ["apps/demo/lib/memo/index.ts", false],
    ["apps/demo/ui/index.ts", false],
    ["apps/demo/lib/st.ts", false],
    ["apps/demo/lib/__client/memo.st.ts", false],
    ["apps/demo/client.ts", false],
    ["apps/demo/.akan/generated/entry/Card.tsx", false],
    ["apps/demo/node_modules/pkg/src/a.ts", false],
    ["apps/demo/ui/styles.css", false],
    ["pkgs/akanjs/ui/Button.tsx", false],
    ["node_modules/akanjs/ui/Button.tsx", false],
  ])("%s is taken apart: %p", (file, split) => {
    expect(PartModules.splits("/repo", path.join("/repo", file))).toBe(split);
  });

  const pair = "/repo/apps/demo/ui/Pair.tsx";
  const host = 'import { A } from "./Pair";\nexport const Host = A;\nexport const Other = 1;\n';
  const sources: Record<string, PartSource> = {
    [pair]: { source: "export const A = () => 1;\nexport const B = () => 2;\n" },
    "/repo/apps/demo/ui/Page.tsx": { source: 'import { A } from "./Pair";\nexport const Page = () => A;\n' },
    "/repo/apps/demo/ui/Host.tsx": { source: host, settled: true },
    "/repo/apps/demo/lib/st.ts": {
      source: 'import { B } from "../ui/Pair";\nexport const st = B;\nexport const b = 1;\n',
    },
  };
  const modules = () => {
    const reads: string[] = [];
    const cache = new Map<string, ModuleParts | null>();
    const made = new PartModules({
      workspaceRoot: "/repo",
      resolve: async (specifier, importer) => path.resolve(path.dirname(importer), `${specifier}.tsx`),
      read: async (file) => {
        reads.push(file);
        return sources[file] ?? null;
      },
      cache,
    });
    return { made, reads, cache };
  };

  test("a file's path answers with re-exports of its parts, and the path with a part's id with that part", async () => {
    const { made, reads, cache } = modules();

    expect(await made.load(pair)).toBe(
      `export { A } from "${pair}?akan-part=p0";\nexport { B } from "${pair}?akan-part=p1";\n`,
    );
    expect(await made.load(`${pair}?akan-part=p1`)).toBe("export const B = () => 2;\n");
    expect(reads).toEqual([pair]);
    expect(cache.size).toBe(1);
    expect(PartModules.fileOf(`${pair}?akan-part=p1`)).toBe(pair);
    await expect(made.load(`${pair}?akan-part=p7`)).rejects.toThrow("was asked for a part it does not have: p7");
  });

  test("a file left whole still asks a file in parts for the part it names", async () => {
    const { made } = modules();

    expect(await made.load("/repo/apps/demo/ui/Page.tsx")).toBe(
      `import { A } from "${pair}?akan-part=p0";\nexport const Page = () => A;\n`,
    );
    expect(await made.load("/repo/apps/demo/lib/st.ts")).toBe(
      `import { B } from "${pair}?akan-part=p1";\nexport const st = B;\nexport const b = 1;\n`,
    );
  });

  test("a source handed over as settled is loaded as it is, and a file the bundler reads itself gives nothing", async () => {
    const { made } = modules();

    expect(await made.load("/repo/apps/demo/ui/Host.tsx")).toBe(host);
    expect(await made.load("/repo/apps/demo/ui/Unknown.tsx")).toBeNull();
  });

  describe("in a bundle of two entries, each naming one export of the same file", () => {
    const seen = "(globalThis as { __akanPartsSeen?: string[] }).__akanPartsSeen";
    const fixture = async () => {
      const root = await realpath(await makeTempRoot());
      const file = (name: string) => path.join(root, "apps/demo", name);
      for (const name of ["A", "B"])
        await write(
          file(`ui/heavy${name}.ts`),
          `export const heavy${name} = { mark: "heavy-${name.toLowerCase()}-marker" };\n`,
        );
      await write(
        file("ui/Pair.ts"),
        [
          'import { heavyA } from "./heavyA";',
          'import { heavyB } from "./heavyB";',
          `const loaded = (${seen} ??= []);`,
          'loaded.push("pair");',
          "export const A = () => [heavyA.mark, loaded.length];",
          "export const B = () => [heavyB.mark, loaded.length];",
          "",
        ].join("\n"),
      );
      for (const name of ["A", "B"])
        await write(file(`page/${name.toLowerCase()}.ts`), `export { ${name} } from "../ui/Pair";\n`);
      const bundle = async (outdir: string, inParts: boolean) => {
        const made = new PartModules({
          workspaceRoot: root,
          resolve: async (specifier, importer) => Bun.resolveSync(specifier, path.dirname(importer)),
          read: async (source) => ({ source: await Bun.file(source).text() }),
          cache: new Map(),
        });
        const built = await Bun.build({
          entrypoints: [file("page/a.ts"), file("page/b.ts")],
          outdir: path.join(root, outdir),
          splitting: true,
          target: "browser",
          format: "esm",
          plugins: inParts
            ? [
                {
                  name: "parts",
                  setup(build) {
                    build.onResolve({ filter: ModuleParts.specifier }, ({ path: asked }) => ({ path: asked }));
                    build.onLoad({ filter: /\.ts(\?akan-part=[\w$]+)?$/ }, async ({ path: request }) => ({
                      contents: (await made.load(request)) ?? "",
                      loader: "ts",
                    }));
                  },
                },
              ]
            : [],
        });
        const entryOf = (name: string) =>
          built.outputs.find((output) => output.kind === "entry-point" && path.basename(output.path) === `${name}.js`)
            ?.path ?? "";
        const loadedBy = async (output: string, known = new Set<string>()): Promise<string> => {
          if (known.has(output)) return "";
          known.add(output);
          const text = await Bun.file(output).text();
          const imported = [...text.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)].map(([, specifier]) =>
            path.resolve(path.dirname(output), specifier ?? ""),
          );
          return [text, ...(await Promise.all(imported.map((next) => loadedBy(next, known))))].join("\n");
        };
        return { entryOf, loadedBy };
      };
      return { bundle };
    };

    test("an entry loads the import of the export it names and not its sibling's, and the file's own statements still run first", async () => {
      const { bundle } = await fixture();
      const { entryOf, loadedBy } = await bundle("out-parts", true);

      const a = await loadedBy(entryOf("a"));
      const b = await loadedBy(entryOf("b"));
      expect(a).toContain("heavy-a-marker");
      expect(a).not.toContain("heavy-b-marker");
      expect(b).toContain("heavy-b-marker");
      expect(b).not.toContain("heavy-a-marker");

      const state = globalThis as { __akanPartsSeen?: string[] };
      const loaded: string[] = [];
      state.__akanPartsSeen = loaded;
      const { A } = (await import(entryOf("a"))) as { A: () => unknown[] };
      const { B } = (await import(entryOf("b"))) as { B: () => unknown[] };
      expect(A()).toEqual(["heavy-a-marker", 1]);
      expect(B()).toEqual(["heavy-b-marker", 1]);
      expect(loaded).toEqual(["pair"]);
    });

    test("left whole, the file is one chunk and each entry loads both imports", async () => {
      const { bundle } = await fixture();
      const { entryOf, loadedBy } = await bundle("out-whole", false);

      const a = await loadedBy(entryOf("a"));
      expect(a).toContain("heavy-a-marker");
      expect(a).toContain("heavy-b-marker");
    });
  });
});
