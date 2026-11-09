import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { VendorNarrowing } from "./vendorNarrowing";

const makeTempRoot = tempDirs("akan-vendor-narrowing-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const vendorFile = (name: string) => path.join(akanjsRoot, "server/vendor", `${name}.ts`);
const agentOnlyText = "path must be an internal path starting with /.";

const staticClosure = (absPath: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(absPath)) return seen;
  seen.add(absPath);
  const transpiler = new Bun.Transpiler({ loader: "js" });
  for (const { path: imported, kind } of transpiler.scanImports(readFileSync(absPath, "utf8")))
    if (kind !== "dynamic-import" && imported.startsWith("."))
      staticClosure(path.resolve(path.dirname(absPath), imported), seen);
  return seen;
};
const closureText = (absPath: string) =>
  [...staticClosure(absPath)].map((file) => readFileSync(file, "utf8")).join("\n");

const buildVendors = async (storeNames: string[], plugins: Awaited<ReturnType<VendorNarrowing["plugins"]>>) => {
  const root = await makeTempRoot();
  const storeAlias = path.join(root, "store.ts");
  const agentAlias = path.join(root, "agent.ts");
  await write(storeAlias, ClientEntriesBundler.narrowedAliasSource(vendorFile("akanjs-store"), storeNames));
  await write(agentAlias, `export * from ${JSON.stringify(vendorFile("akanjs-store-agent"))};\n`);
  const result = await Bun.build({
    entrypoints: [storeAlias, agentAlias],
    outdir: path.join(root, "out"),
    splitting: true,
    target: "browser",
    format: "esm",
    plugins,
  });
  expect(result.logs.map((log) => log.message)).toEqual([]);
  const outputOf = (name: string) => {
    const output = result.outputs.find((o) => o.kind === "entry-point" && path.basename(o.path) === `${name}.js`);
    if (!output) throw new Error(`no ${name}.js output`);
    return output.path;
  };
  return { store: closureText(outputOf("store")), agent: closureText(outputOf("agent")) };
};

describe("VendorNarrowing", () => {
  test("maps each narrowed specifier's vendor entry to its names and leaves the rest whole", () => {
    const narrowing = new VendorNarrowing(akanjsRoot, { "akanjs/store": ["st"], "akanjs/base": [] });

    expect(
      narrowing.entryExports([
        { specifier: "akanjs/store", absPath: "/v/akanjs-store.ts" },
        { specifier: "akanjs/base", absPath: "/v/akanjs-base.ts" },
        { specifier: "akanjs/common", absPath: "/v/akanjs-common.ts" },
      ]),
    ).toEqual({ "/v/akanjs-store.ts": ["st"], "/v/akanjs-base.ts": [] });
  });

  test("keeps the deprecated agent re-export when a route imports one of its names, or reads the store whole", async () => {
    expect(await new VendorNarrowing(akanjsRoot, { "akanjs/store": ["AgentContext", "st"] }).plugins()).toEqual([]);
    expect(await new VendorNarrowing(akanjsRoot, {}).plugins()).toEqual([]);
  });

  test("a store vendor no route reads an agent name from loads no agent runtime; the agent vendor does", async () => {
    const narrowing = new VendorNarrowing(akanjsRoot, { "akanjs/store": ["StoreRegistry", "store"] });
    const plugins = await narrowing.plugins();
    expect(plugins).toHaveLength(1);

    const { store, agent } = await buildVendors(["StoreRegistry", "store"], plugins);

    expect(store).not.toContain(agentOnlyText);
    expect(agent).toContain(agentOnlyText);
  }, 60_000);

  test("without the blanking, the deprecated re-export drags the agent runtime into the store vendor", async () => {
    const { store } = await buildVendors(["StoreRegistry", "store"], []);

    expect(store).toContain(agentOnlyText);
  }, 60_000);

  test("an alias narrowed to no names still loads its entry, so the entry's side effects run", () => {
    expect(ClientEntriesBundler.narrowedAliasSource("/v/akanjs-fetch.ts", [])).toBe(
      `export {} from ${JSON.stringify(path.resolve("/v/akanjs-fetch.ts"))};\n`,
    );
  });
});
