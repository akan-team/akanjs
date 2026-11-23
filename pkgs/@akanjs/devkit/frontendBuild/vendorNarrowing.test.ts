import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { VendorNarrowing } from "./vendorNarrowing";

const makeTempRoot = tempDirs("akan-vendor-narrowing-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const vendorFile = (name: string) => path.join(akanjsRoot, "server/vendor", `${name}.ts`);
const agentOnlyText = "path must be an internal path starting with /.";
const formFieldsText = "does not take null.";
const fieldToolsText = "Leaves every existing row untouched.";

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
  return {
    store: closureText(outputOf("store")),
    agent: closureText(outputOf("agent")),
    all: result.outputs.map((output) => readFileSync(output.path, "utf8")).join("\n"),
  };
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

  test("keeps each blankable re-export when a route imports one of its names, or reads the store whole", async () => {
    const names = ["AgentContext", "FormFields", "st"];
    expect(await new VendorNarrowing(akanjsRoot, { "akanjs/store": names }).plugins()).toEqual([]);
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

  test("a store vendor no route reads `FormFields` from loads the field tools only through a dynamic import", async () => {
    const names = ["StoreRegistry", "store", "useFieldTool"];
    const { store, all } = await buildVendors(
      names,
      await new VendorNarrowing(akanjsRoot, { "akanjs/store": names }).plugins(),
    );

    expect(store).not.toContain(formFieldsText);
    expect(store).not.toContain(fieldToolsText);
    expect(all).toContain(fieldToolsText);
  }, 60_000);

  test("a route that names `FormFields` keeps it in the store vendor, and the field tools still load apart", async () => {
    const names = ["FormFields", "StoreRegistry", "store"];
    const { store } = await buildVendors(
      names,
      await new VendorNarrowing(akanjsRoot, { "akanjs/store": names }).plugins(),
    );

    expect(store).toContain(formFieldsText);
    expect(store).not.toContain(fieldToolsText);
  }, 60_000);

  test("without the blanking, the deprecated re-export drags the agent runtime into the store vendor", async () => {
    const { store } = await buildVendors(["StoreRegistry", "store"], []);

    expect(store).toContain(agentOnlyText);
  }, 60_000);

  test("an akanjs older than the agent split keeps whole vendors and gets no agent entry", async () => {
    const root = await makeTempRoot();
    for (const name of ["akanjs-store", "akanjs-base"])
      await write(path.join(root, "server/vendor", `${name}.ts`), `export * from "${name}";\n`);
    const entries = VendorNarrowing.entriesIn(path.join(root, "server"));
    const narrowing = new VendorNarrowing(root, { "akanjs/store": ["st"], "akanjs/base": [] });

    expect(entries.map(({ specifier }) => specifier)).toEqual(["akanjs/store", "akanjs/base"]);
    expect(narrowing.entryExports(entries)).toEqual({});
    expect(await narrowing.plugins()).toEqual([]);
    expect(VendorNarrowing.entriesIn(path.join(akanjsRoot, "server")).map(({ specifier }) => specifier)).toContain(
      "akanjs/store/agent",
    );
  });

  test("an akanjs from before the lazy field tools has nothing there to blank but its deprecated re-export", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "store/deprecatedAgent.ts"), 'export { AgentContext } from "./agent";\n');
    await write(path.join(root, "store/agentic/formFields.ts"), "export class FormFields {}\n");

    const [plugin, ...rest] = await new VendorNarrowing(root, { "akanjs/store": ["st"] }).plugins();
    const filters: RegExp[] = [];
    void plugin?.setup({ onLoad: ({ filter }: { filter: RegExp }) => void filters.push(filter) } as never);

    expect(rest).toEqual([]);
    expect(filters.map((filter) => filter.test("/w/node_modules/akanjs/store/deprecatedAgent.ts"))).toEqual([true]);
    expect(filters.map((filter) => filter.test("/w/node_modules/akanjs/store/agentic/formFields.ts"))).toEqual([false]);
  });

  test("an alias narrowed to no names still loads its entry, so the entry's side effects run", () => {
    expect(ClientEntriesBundler.narrowedAliasSource("/v/akanjs-fetch.ts", [])).toBe(
      `export {} from ${JSON.stringify(path.resolve("/v/akanjs-fetch.ts"))};\n`,
    );
  });
});
