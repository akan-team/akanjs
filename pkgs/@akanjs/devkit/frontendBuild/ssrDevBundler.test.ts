import { describe, expect, test } from "bun:test";
import path from "node:path";
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
