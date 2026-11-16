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
  const appOf = (root: string, clientRuntime: "all" | "route") =>
    ({
      name: "demo",
      cwdPath: path.join(root, "apps/demo"),
      workspace: { workspaceRoot: root },
      basePaths: new Set<string>(),
      getConfig: async () => ({ clientRuntime, optimizeImports: [], barrelImports: [], basePaths: new Set<string>() }),
      getPublicEnv: () => ({}),
    }) as never;
  const writeLib = async (root: string, files: string[]) => {
    for (const file of files) await write(path.join(root, "apps/demo/lib", file), "export {};\n");
  };

  test("boots the page runtime alone and answers the model runtime marker with the app's runtime", async () => {
    const root = await makeTempRoot();
    await writeLib(root, ["st.ts", "useClient.ts", `${StoreBootstrap.pageRuntime}.ts`]);
    const bundler = new SsrDevBundler(appOf(root, "route"));
    const context = await bundler.context();
    const { files } = await bundler.writeEntries(context);

    expect(await Bun.file(files[SsrDevBundler.bootstrapKey] ?? "").text()).toBe(
      `import "@apps/demo/lib/${StoreBootstrap.pageRuntime}";\n`,
    );
    expect(context.modelRuntime).toBe(
      [path.join(root, "apps/demo/lib/useClient.ts"), path.join(root, "apps/demo/lib/st.ts")]
        .map((file) => `import ${JSON.stringify(file.split(path.sep).join("/"))};\n`)
        .join(""),
    );
    expect(context.configKey).not.toBe((await new SsrDevBundler(appOf(root, "all")).context()).configKey);
  });

  test("keeps the whole runtime when the app was not synced to a page runtime yet", async () => {
    const root = await makeTempRoot();
    await writeLib(root, ["st.ts", "useClient.ts"]);
    const bundler = new SsrDevBundler(appOf(root, "route"));
    const context = await bundler.context();
    const { files } = await bundler.writeEntries(context);

    expect(context.modelRuntime).toBeUndefined();
    expect(await Bun.file(files[SsrDevBundler.bootstrapKey] ?? "").text()).toBe(
      'import "@apps/demo/lib/useClient";\nimport "@apps/demo/lib/st";\n',
    );
  });
});
