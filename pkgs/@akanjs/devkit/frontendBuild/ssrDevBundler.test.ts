import { describe, expect, test } from "bun:test";
import path from "node:path";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { SsrDevBundler } from "./ssrDevBundler";

const makeTempRoot = tempDirs("akan-ssr-dev-bundler-");

describe("SsrDevBundler bootstrap", () => {
  const bootstrapOf = async (root: string) => {
    const appDir = path.join(root, "apps/demo");
    const app = { name: "demo", cwdPath: appDir, workspace: { workspaceRoot: root } } as never;
    const { files } = await new SsrDevBundler(app).writeEntries();
    return await Bun.file(files[SsrDevBundler.bootstrapKey] ?? "").text();
  };

  test("runs the client runtime and the store, not the client barrel", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "apps/demo/lib/st.ts"), "export const st = {};\n");

    expect(await bootstrapOf(root)).toBe('import "@apps/demo/lib/useClient";\nimport "@apps/demo/lib/st";\n');
  });

  test("runs nothing for an app without a store", async () => {
    expect(await bootstrapOf(await makeTempRoot())).toBe("export {};\n");
  });
});

describe("SsrDevBundler under clientRuntime route", () => {
  const appOf = (root: string, clientRuntime: "all" | "route", warnings: string[] = []) =>
    ({
      name: "demo",
      cwdPath: path.join(root, "apps/demo"),
      workspace: { workspaceRoot: root },
      basePaths: new Set<string>(),
      getConfig: async () => ({ clientRuntime, optimizeImports: [], barrelImports: [], basePaths: new Set<string>() }),
      getPublicEnv: () => ({}),
      logger: { warn: (message: string) => warnings.push(message) },
    }) as never;
  const writeLib = async (root: string, files: string[]) => {
    for (const file of files) await write(path.join(root, "apps/demo/lib", file), "export {};\n");
  };

  const pageFiles = [
    "st.ts",
    "useClient.ts",
    `${StoreBootstrap.pageRuntime}.ts`,
    `${StoreBootstrap.baseDescriptors}.ts`,
    ...StoreBootstrap.assembled.map((file) => `${file}.ts`),
  ];

  const writeFrameworkBase = async (root: string) => {
    const akanjsRoot = path.dirname(Bun.resolveSync("akanjs/package.json", import.meta.dir));
    for (const file of ["package.json", "store/baseSt.ts", "signal/base.signal.ts", "signal/agent.signal.ts"])
      await write(path.join(root, "node_modules/akanjs", file), await Bun.file(path.join(akanjsRoot, file)).text());
  };

  test("boots the page runtime with the framework's own descriptors and answers the model runtime marker with the app's assembled pieces", async () => {
    const root = await makeTempRoot();
    await writeLib(root, pageFiles);
    await writeFrameworkBase(root);
    const warnings: string[] = [];
    const bundler = new SsrDevBundler(appOf(root, "route", warnings));
    const context = await bundler.context();
    const { files } = await bundler.writeEntries(context);

    expect(warnings).toEqual([]);

    const bootstrap = await Bun.file(files[SsrDevBundler.bootstrapKey] ?? "").text();
    expect(bootstrap).toStartWith(
      `import "@apps/demo/lib/${StoreBootstrap.pageRuntime}";\nimport "@apps/demo/lib/${StoreBootstrap.baseDescriptors}";\n`,
    );
    expect(bootstrap).toEndWith('import "./storeOwners";\n');
    const owners = path.join(path.dirname(files[SsrDevBundler.bootstrapKey] ?? ""), "storeOwners.ts");
    expect(await Bun.file(owners).text()).toContain('[Symbol.for("akanjs.store.owners")] = {"use":');
    expect(context.routeRuntime).toBeDefined();
    expect(context.modelRuntime).toBe(
      StoreBootstrap.assembled
        .map(
          (piece) =>
            `import ${JSON.stringify(path.join(root, "apps/demo/lib", `${piece}.ts`).split(path.sep).join("/"))};\n`,
        )
        .join(""),
    );
    const whole = await new SsrDevBundler(appOf(root, "all")).context();
    expect(context.configKey).not.toBe(whole.configKey);
    expect(whole.routeRuntime).toBeUndefined();
    expect(whole.modelRuntime).toBeUndefined();
  });

  for (const missing of pageFiles.slice(2))
    test(`keeps the whole runtime when the app was not synced to lib/${missing} yet`, async () => {
      const root = await makeTempRoot();
      await writeLib(
        root,
        pageFiles.filter((file) => file !== missing),
      );
      const bundler = new SsrDevBundler(appOf(root, "route"));
      const context = await bundler.context();
      const { files } = await bundler.writeEntries(context);

      expect(context.modelRuntime).toBeUndefined();
      expect(await Bun.file(files[SsrDevBundler.bootstrapKey] ?? "").text()).toBe(
        'import "@apps/demo/lib/useClient";\nimport "@apps/demo/lib/st";\n',
      );
    });

  test("says once, not on every save, that a route app missing its runtime files loads the whole runtime", async () => {
    const root = await makeTempRoot();
    await writeLib(root, pageFiles.slice(0, -1));
    await writeFrameworkBase(root);
    const warnings: string[] = [];
    const bundler = new SsrDevBundler(appOf(root, "route", warnings));

    await bundler.context();
    await bundler.context();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("loads the whole client runtime. Run `akan sync demo`.");

    await writeLib(root, pageFiles.slice(-1));
    expect((await bundler.context()).routeRuntime).toBeDefined();
    await Bun.file(path.join(root, "apps/demo/lib", pageFiles.at(-1) ?? "")).delete();
    await bundler.context();
    expect(warnings).toHaveLength(2);
    expect((await new SsrDevBundler(appOf(root, "all", warnings)).context()).routeRuntime).toBeUndefined();
    expect(warnings).toHaveLength(2);
  });
});
