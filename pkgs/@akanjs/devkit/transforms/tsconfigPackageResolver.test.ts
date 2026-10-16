import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../testHelpers";
import { createTsconfigPackageResolver } from "./barrelImportsPlugin";

const makeTempRoot = tempDirs("akan-devkit-resolver-");

const write = async (root: string, relPath: string, content = "export const value = 1;\n") => {
  const filePath = path.join(root, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return filePath;
};

const resolverFor = async (root: string, paths: Record<string, string[]>) =>
  await createTsconfigPackageResolver({
    workspace: { workspaceRoot: root },
    getTsConfig: async () => ({ compilerOptions: { paths } }),
  } as never);

describe("createTsconfigPackageResolver — exact tsconfig mapping", () => {
  test("resolves a package barrel and keeps the specifier", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "libs/util/index.ts");
    const resolve = await resolverFor(root, { "@libs/util": ["./libs/util/index.ts"] });

    expect(await resolve("@libs/util")).toEqual({
      pkgName: "@libs/util",
      entryFile,
      pkgDir: path.join(root, "libs/util"),
    });
  });

  test("collapses a facet specifier to its parent package", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "libs/util/server.ts");
    const resolve = await resolverFor(root, { "@libs/util/server": ["./libs/util/server.ts"] });

    expect(await resolve("@libs/util/server")).toEqual({
      pkgName: "@libs/util",
      entryFile,
      pkgDir: path.join(root, "libs/util"),
    });
  });

  test("keeps the specifier when the entry file name does not match the facet", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "libs/util/clientEntry.ts");
    const resolve = await resolverFor(root, { "@libs/util/client": ["./libs/util/clientEntry.ts"] });

    expect(await resolve("@libs/util/client")).toEqual({
      pkgName: "@libs/util/client",
      entryFile,
      pkgDir: path.join(root, "libs/util"),
    });
  });

  test("returns null when the mapped file is missing", async () => {
    const root = await makeTempRoot();
    const resolve = await resolverFor(root, { "@libs/util": ["./libs/util/index.ts"] });
    expect(await resolve("@libs/util")).toBeNull();
  });

  test("returns null for an empty mapping", async () => {
    const root = await makeTempRoot();
    await write(root, "libs/util/index.ts");
    const resolve = await resolverFor(root, { "@libs/util": [""] });
    expect(await resolve("@libs/util")).toBeNull();
  });
});

describe("createTsconfigPackageResolver — wildcard tsconfig mapping", () => {
  test("prefers the longer prefix", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "custom/ui/index.ts");
    await write(root, "libs/util/ui/index.ts");
    const resolve = await resolverFor(root, {
      "@libs/*": ["./libs/*"],
      "@libs/util/*": ["./custom/*"],
    });

    expect(await resolve("@libs/util/ui")).toEqual({
      pkgName: "@libs/util/ui",
      entryFile,
      pkgDir: path.join(root, "custom/ui"),
    });
  });

  test("collapses a sibling facet file to its parent package", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "apps/minimal/client.ts");
    const resolve = await resolverFor(root, { "@apps/*": ["./apps/*"] });

    expect(await resolve("@apps/minimal/client")).toEqual({
      pkgName: "@apps/minimal",
      entryFile,
      pkgDir: path.join(root, "apps/minimal"),
    });
  });

  test("resolves a directory barrel and keeps the specifier", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "apps/minimal/index.tsx");
    const resolve = await resolverFor(root, { "@apps/*": ["./apps/*"] });

    expect(await resolve("@apps/minimal")).toEqual({
      pkgName: "@apps/minimal",
      entryFile,
      pkgDir: path.join(root, "apps/minimal"),
    });
  });

  test("prefers a sibling facet file over a same-named directory barrel", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "apps/minimal/client.ts");
    await write(root, "apps/minimal/client/index.ts");
    const resolve = await resolverFor(root, { "@apps/*": ["./apps/*"] });

    expect((await resolve("@apps/minimal/client"))?.entryFile).toBe(entryFile);
  });

  test("stops at the matched prefix instead of falling through to a shorter one", async () => {
    const root = await makeTempRoot();
    await write(root, "libs/util/ui/index.ts");
    const resolve = await resolverFor(root, {
      "@libs/*": ["./libs/*"],
      "@libs/util/*": ["./custom/*"],
    });

    expect(await resolve("@libs/util/ui")).toBeNull();
  });

  test("tries every replacement of a matched prefix", async () => {
    const root = await makeTempRoot();
    const entryFile = await write(root, "second/util/index.ts");
    const resolve = await resolverFor(root, { "@libs/*": ["./first/*", "./second/*"] });

    expect((await resolve("@libs/util"))?.entryFile).toBe(entryFile);
  });
});

describe("createTsconfigPackageResolver — node_modules fallback", () => {
  const writePackageJson = async (root: string, pkgName: string, pkgJson: unknown) =>
    await write(root, `node_modules/${pkgName}/package.json`, JSON.stringify(pkgJson));

  test("resolves an exports subpath and preserves the file path", async () => {
    const root = await makeTempRoot();
    await writePackageJson(root, "akanjs", { exports: { "./ui": { source: "./ui/index.ts" } } });
    const entryFile = await write(root, "node_modules/akanjs/ui/index.ts");
    const resolve = await resolverFor(root, {});

    expect(await resolve("akanjs/ui")).toEqual({
      pkgName: "akanjs/ui",
      entryFile,
      pkgDir: path.join(root, "node_modules/akanjs/ui"),
      preserveFilePath: true,
    });
  });

  test("resolves an exports wildcard subpath", async () => {
    const root = await makeTempRoot();
    await writePackageJson(root, "akanjs", { exports: { "./*": "./dist/*.js" } });
    const entryFile = await write(root, "node_modules/akanjs/dist/signal.js");
    const resolve = await resolverFor(root, {});

    expect((await resolve("akanjs/signal"))?.entryFile).toBe(entryFile);
  });

  test("substitutes every * of a wildcard target, as Node does", async () => {
    const root = await makeTempRoot();
    await writePackageJson(root, "akanjs", { exports: { "./*": "./*/*.js" } });
    const entryFile = await write(root, "node_modules/akanjs/signal/signal.js");
    const resolve = await resolverFor(root, {});

    expect((await resolve("akanjs/signal"))?.entryFile).toBe(entryFile);
  });

  test("resolves a scoped package subpath", async () => {
    // Vendor-neutral on purpose: `packageExports.test.ts` reads every `"@akanjs/devkit/<x>"` literal here as an import.
    const root = await makeTempRoot();
    await writePackageJson(root, "@vendor/kit", { exports: { "./lint": "./lint/index.ts" } });
    const entryFile = await write(root, "node_modules/@vendor/kit/lint/index.ts");
    const resolve = await resolverFor(root, {});

    expect((await resolve("@vendor/kit/lint"))?.entryFile).toBe(entryFile);
  });

  test("falls back to module/main when exports resolution declines the specifier", async () => {
    // `main` without a leading `./` is declined by the exports resolver, so only the last fallback resolves it.
    const root = await makeTempRoot();
    await writePackageJson(root, "plainpkg", { main: "index.js" });
    const entryFile = await write(root, "node_modules/plainpkg/index.js");
    const resolve = await resolverFor(root, {});

    expect(await resolve("plainpkg")).toEqual({
      pkgName: "plainpkg",
      entryFile,
      pkgDir: path.join(root, "node_modules/plainpkg"),
    });
  });

  test("returns null when the package is not installed", async () => {
    const root = await makeTempRoot();
    expect(await resolverFor(root, {}).then((resolve) => resolve("missingpkg"))).toBeNull();
  });

  test("returns null when the package.json is unparseable", async () => {
    const root = await makeTempRoot();
    await write(root, "node_modules/brokenpkg/package.json", "{ not json");
    const resolve = await resolverFor(root, {});
    expect(await resolve("brokenpkg")).toBeNull();
  });

  test("returns null when the resolved entry file is missing", async () => {
    const root = await makeTempRoot();
    await writePackageJson(root, "ghostpkg", { module: "./dist/index.js" });
    const resolve = await resolverFor(root, {});
    expect(await resolve("ghostpkg")).toBeNull();
  });
});
