import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RoutesManifest } from "akanjs/server";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";
import { CssCompiler, isIgnoredNodeModuleSource } from "./cssCompiler";
import { CssImportResolver } from "./cssImportResolver";
import { DevChangePlanner } from "./devChangePlanner";
import { DevGeneratedIndexSync } from "./devGeneratedIndexSync";
import { HmrChangeClassifier } from "./hmrChangeClassifier";
import { PagesBundleBuilder } from "./pagesBundleBuilder";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";
import { RoutesManifestArtifactSerializer } from "./routesManifestArtifactSerializer";
import { prepareCssAsset } from "./ssrBaseArtifactBuilder";

const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-devkit-frontend-"));
  tempRoots.push(root);
  return root;
};

const write = async (filePath: string, content: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PagesEntrySourceGenerator", () => {
  const toSpecifier = (absPath: string) => path.resolve(absPath).split(path.sep).join("/");

  test("generates dynamic import source using forward-slash module paths", () => {
    const indexAbs = path.resolve("/repo/apps/demo/page/_index.tsx");
    const adminAbs = path.resolve("/repo/apps/demo/page/admin.tsx");
    const source = PagesEntrySourceGenerator.generate([
      { key: "./_index.tsx", moduleAbsPath: indexAbs },
      { key: "./admin.tsx", moduleAbsPath: adminAbs },
    ]);

    expect(source).toBe(
      [
        "export const pages = {",
        `  "./_index.tsx": () => import(${JSON.stringify(toSpecifier(indexAbs))}),`,
        `  "./admin.tsx": () => import(${JSON.stringify(toSpecifier(adminAbs))}),`,
        "};",
        "",
      ].join("\n"),
    );
  });

  test("generates static import source for single-file CSR bundles", () => {
    const indexAbs = path.resolve("/repo/apps/demo/page/_index.tsx");
    const adminAbs = path.resolve("/repo/apps/demo/page/admin.tsx");
    const source = PagesEntrySourceGenerator.generateStatic([
      { key: "./_index.tsx", moduleAbsPath: indexAbs },
      { key: "./admin.tsx", moduleAbsPath: adminAbs },
    ]);

    expect(source).toBe(
      [
        `import * as page0 from ${JSON.stringify(toSpecifier(indexAbs))};`,
        `import * as page1 from ${JSON.stringify(toSpecifier(adminAbs))};`,
        "export const pages = {",
        '  "./_index.tsx": { loader: async () => page0, isAsyncDefault: false },',
        '  "./admin.tsx": { loader: async () => page1, isAsyncDefault: false },',
        "};",
        "",
      ].join("\n"),
    );
  });

  test("marks async default exports for static CSR bundles", async () => {
    const root = await makeTempRoot();
    const indexPath = path.join(root, "page/_index.tsx");
    const adminPath = path.join(root, "page/admin.tsx");
    const typedPath = path.join(root, "page/typed.tsx");
    const expressionPath = path.join(root, "page/expression.tsx");
    const namedExportPath = path.join(root, "page/named-export.tsx");
    await write(indexPath, "export default async function Page() { return null; }");
    await write(adminPath, "const Admin = async () => null;\nexport default Admin;");
    await write(typedPath, "const Typed: () => Promise<null> = async () => null;\nexport default Typed;");
    await write(expressionPath, "export default async () => null;");
    await write(namedExportPath, "async function NamedExport() { return null; }\nexport { NamedExport as default };");

    const source = PagesEntrySourceGenerator.generateStatic([
      { key: "./_index.tsx", moduleAbsPath: indexPath },
      { key: "./admin.tsx", moduleAbsPath: adminPath },
      { key: "./typed.tsx", moduleAbsPath: typedPath },
      { key: "./expression.tsx", moduleAbsPath: expressionPath },
      { key: "./named-export.tsx", moduleAbsPath: namedExportPath },
    ]);

    expect(source).toContain('"./_index.tsx": { loader: async () => page0, isAsyncDefault: true },');
    expect(source).toContain('"./admin.tsx": { loader: async () => page1, isAsyncDefault: true },');
    expect(source).toContain('"./typed.tsx": { loader: async () => page2, isAsyncDefault: true },');
    expect(source).toContain('"./expression.tsx": { loader: async () => page3, isAsyncDefault: true },');
    expect(source).toContain('"./named-export.tsx": { loader: async () => page4, isAsyncDefault: true },');
  });
});

describe("PagesBundleBuilder", () => {
  test("stubs CSS imports in the server pages bundle", async () => {
    const root = await makeTempRoot();
    const entry = path.join(root, "entry.tsx");
    const css = path.join(root, "styles.css");
    const outdir = path.join(root, "out");
    await write(entry, ['import "./styles.css";', "export const marker = 1;", ""].join("\n"));
    await write(
      css,
      ['@plugin "daisyui" {', "  themes: false;", "}", "@theme {", "  --color-primary: red;", "}", ""].join("\n"),
    );

    const result = await Bun.build({
      entrypoints: [entry],
      outdir,
      target: "bun",
      format: "esm",
      plugins: [PagesBundleBuilder.createServerCssStubPlugin()],
    });

    expect(result.success).toBe(true);
    expect(result.logs).toEqual([]);
    expect(result.outputs.some((output) => output.kind === "entry-point")).toBe(true);
  });

  test("uses live server fetch instead of signal macro in server pages bundles", () => {
    const source = [
      'import { makePageProto, registerClientRuntime } from "akanjs/client";',
      'import { FetchClient } from "akanjs/fetch";',
      'import * as cnst from "./cnst";',
      'import { getSerializedSignal } from "./sig" with { type: "macro" };',
      'import type * as dict from "./dict";',
      'import type * as signal from "./sig";',
      "",
      "const dictionary = {};",
      "const pageProto = makePageProto<typeof dict>(dictionary);",
      "const fetchProto = FetchClient.build<typeof signal>(cnst, getSerializedSignal(), { Err: pageProto.Err });",
      'export const runtime = registerClientRuntime({ ...pageProto, ...fetchProto }, { scope: "app" });',
      "",
    ].join("\n");

    const transformed = PagesBundleBuilder.transformServerUseClientFetchSource(source);

    expect(transformed).toContain('import { fetch as serverFetch } from "./sig";');
    expect(transformed).toContain(
      "const fetchProto = FetchClient.build<typeof signal>(cnst, serverFetch.serializedSignal, { Err: pageProto.Err, base: serverFetch });",
    );
    expect(transformed).not.toContain("getSerializedSignal");
    expect(transformed).not.toContain('with { type: "macro" }');
  });
});

describe("CsrArtifactBuilder", () => {
  test("replaces module script src with inline script", async () => {
    const html = [
      "<html>",
      "<head></head>",
      "<body>",
      '<script type="module" crossorigin src="./chunk.js"></script>',
      "</body>",
      "</html>",
    ].join("\n");

    const inlined = await CsrArtifactBuilder.replaceModuleScriptSrc(html, (src) => {
      expect(src).toBe("./chunk.js");
      return 'console.log("</script>");';
    });

    expect(inlined).toContain('<script type="module">\nconsole.log("<\\/script>");\n</script>');
    expect(inlined).not.toContain("src=");
  });

  test("creates inline stylesheet and strips external stylesheet links", () => {
    const html =
      '<head><link rel="stylesheet" href="/_akan/styles/akanjs.css" data-akan-css="active" /><link rel="stylesheet" href="./generated.css" /></head>';
    const stripped = CsrArtifactBuilder.stripBundledStylesheetLinks(html);
    const style = CsrArtifactBuilder.createInlineStyle("body::before{content:'</style>';}");

    expect(stripped).toBe("<head></head>");
    expect(style).toBe("<style data-akan-css=\"active\">\nbody::before{content:'<\\/style>';}\n</style>");
  });
});

describe("SsrBaseArtifactBuilder", () => {
  test("minifies CSS assets only for production builds", async () => {
    const css = [
      ".card {",
      "  color: red;",
      "  padding: 1rem;",
      "}",
      "",
      "@media (width >= 768px) {",
      "  .card {",
      "    color: blue;",
      "  }",
      "}",
      "",
    ].join("\n");

    const development = await prepareCssAsset("start", "", css);
    const production = await prepareCssAsset("build", "", css);

    expect(development).toContain(".card");
    expect(development).toContain("color: red");
    expect(production.length).toBeLessThan(css.length);
    expect(production).toContain(".card{");
    expect(production).not.toContain("\n  ");
  });
});

describe("RoutesManifestArtifactSerializer", () => {
  test("serializes absolute artifact paths relative to artifact directory", () => {
    const manifest = {
      knownEntries: ["/repo/dist/apps/demo/.akan/artifact/pages.js", "already-relative.js"],
      clientManifest: {
        "/repo/dist/apps/demo/.akan/artifact/client.js": { file: "client.js" },
      },
      ssrManifest: {
        moduleMap: {
          "/entry": {
            default: {
              id: "/repo/dist/apps/demo/.akan/artifact/server/page.js",
              chunks: ["/repo/dist/apps/demo/.akan/artifact/chunks/a.js", "chunks/b.js"],
              name: "default",
            },
          },
        },
      },
    } as unknown as RoutesManifest;

    const serialized = RoutesManifestArtifactSerializer.serialize(manifest, "/repo/dist/apps/demo/.akan/artifact");
    expect(serialized.knownEntries).toEqual(["pages.js", "already-relative.js"]);
    expect(Object.keys(serialized.clientManifest)).toEqual(["client.js"]);
    expect(serialized.ssrManifest.moduleMap["/entry"]?.default?.id).toBe("server/page.js");
    expect(serialized.ssrManifest.moduleMap["/entry"]?.default?.chunks).toEqual(["chunks/a.js", "chunks/b.js"]);

    const production = RoutesManifestArtifactSerializer.serialize(manifest, "/repo/dist/apps/demo/.akan/artifact", {
      production: true,
    });
    expect(production.knownEntries).toBeUndefined();
  });
});

describe("HmrChangeClassifier", () => {
  test("classifies code, css, config, and ignored files", () => {
    const classifier = new HmrChangeClassifier();
    expect(classifier.classify("/repo/apps/demo/page/_index.tsx")).toBe("code");
    expect(classifier.classify("/repo/apps/demo/page/styles.css")).toBe("css");
    expect(classifier.classify("/repo/apps/demo/akan.config.ts")).toBe("config");
    expect(classifier.classify("/repo/apps/demo/.DS_Store")).toBe("ignore");
    expect(classifier.classify(`/repo/apps/demo/node_modules/pkg/index.ts`)).toBe("ignore");
    expect(classifier.classify(`/repo/apps/demo/.akan/generated/page.tsx`)).toBe("ignore");
    expect(classifier.classify("/repo/apps/demo/public/logo.png")).toBe("ignore");
  });
});

describe("DevGeneratedIndexSync", () => {
  test("updates barrel facet index for file add and delete", async () => {
    const root = await makeTempRoot();
    const foo = path.join(root, "libs/shared/common/foo.ts");
    const index = path.join(root, "libs/shared/common/index.ts");
    const sync = new DevGeneratedIndexSync({ workspaceRoot: root });

    await write(foo, "export const foo = 1;\n");
    const added = await sync.syncForBatch([foo]);

    expect(added.errors).toEqual([]);
    expect(added.changedFiles).toEqual([index]);
    expect(await readFile(index, "utf8")).toBe('export * from "./foo";\n');

    await rm(foo);
    const removed = await sync.syncForBatch([foo]);

    expect(removed.errors).toEqual([]);
    expect(removed.changedFiles).toEqual([index]);
    expect(await Bun.file(index).exists()).toBe(false);
  });

  test("ignores server/client folders as barrel facets", async () => {
    const root = await makeTempRoot();
    const serverFile = path.join(root, "libs/shared/server/foo.ts");
    const clientFile = path.join(root, "libs/shared/client/foo.ts");
    const sync = new DevGeneratedIndexSync({ workspaceRoot: root });

    await write(serverFile, "export const foo = 1;\n");
    await write(clientFile, "export const foo = 1;\n");
    const result = await sync.syncForBatch([serverFile, clientFile]);

    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });

  test("ignores individual module UI file changes for module index sync", async () => {
    const root = await makeTempRoot();
    const template = path.join(root, "libs/shared/lib/admin/Admin.Template.tsx");
    const sync = new DevGeneratedIndexSync({ workspaceRoot: root });

    await write(template, "export const Admin = () => null;\n");
    const result = await sync.syncForBatch([template]);

    expect(result.errors).toEqual([]);
    expect(result.changedFiles).toEqual([]);
  });
});

describe("DevChangePlanner", () => {
  test("classifies server, client, shared, and generated barrel changes", () => {
    const root = "/repo";
    const planner = new DevChangePlanner({ workspaceRoot: root });
    const generatedIndex = `${root}/libs/shared/common/index.ts`;
    const plan = planner.plan({
      generation: 7,
      files: [
        `${root}/libs/shared/lib/admin/admin.service.ts`,
        `${root}/libs/shared/lib/admin/Admin.Template.tsx`,
        `${root}/libs/shared/lib/admin/admin.constant.ts`,
        `${root}/libs/shared/common/foo.ts`,
      ],
      kinds: ["code"],
      generatedFiles: [generatedIndex],
    });

    expect(plan.generatedFiles).toEqual([generatedIndex]);
    expect(plan.files).toContain(generatedIndex);
    expect(plan.roles).toEqual(["barrel", "client", "server", "shared"]);
    expect(plan.actions).toEqual(["rebuild-client", "restart-backend", "sync-generated"]);
    expect(plan.reasonByFile[generatedIndex]).toContain("generated-index");
  });

  test("keeps css-only and config changes separate from backend restarts", () => {
    const root = "/repo";
    const planner = new DevChangePlanner({ workspaceRoot: root });

    expect(
      planner.plan({ generation: 1, files: [`${root}/apps/akan/page/style.css`], kinds: ["css"] }).actions,
    ).toEqual(["rebuild-css"]);
    expect(
      planner.plan({ generation: 2, files: [`${root}/apps/akan/akan.config.ts`], kinds: ["config"] }).actions,
    ).toEqual(["restart-dev-host"]);
  });

  test("recycles builder for macro-backed dictionary and signal metadata changes", () => {
    const root = "/repo";
    const planner = new DevChangePlanner({ workspaceRoot: root });
    const dictionaryPlan = planner.plan({
      generation: 3,
      files: [`${root}/apps/demo/lib/_demo/demo.dictionary.ts`],
      kinds: ["code"],
    });
    const signalPlan = planner.plan({
      generation: 4,
      files: [`${root}/libs/shared/lib/admin/admin.signal.ts`],
      kinds: ["code"],
    });

    expect(dictionaryPlan.actions).toEqual(["rebuild-client", "restart-backend", "restart-builder"]);
    expect(dictionaryPlan.reasonByFile[`${root}/apps/demo/lib/_demo/demo.dictionary.ts`]).toContain("runtime-metadata");
    expect(signalPlan.actions).toContain("restart-builder");
  });
});

describe("CssImportResolver", () => {
  test("identifies package names and css files", () => {
    expect(CssImportResolver.getPackageName("@scope/pkg/button")).toBe("@scope/pkg");
    expect(CssImportResolver.getPackageName("plain-package/styles")).toBe("plain-package");
    expect(CssImportResolver.getPackageName("@broken")).toBeNull();
    expect(CssImportResolver.isCssFile("/repo/style.css")).toBe(true);
    expect(CssImportResolver.isCssFile("/repo/style.scss")).toBe(false);
  });

  test("resolves css from exact and wildcard tsconfig paths", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "styles/global.css"), "body {}\n");
    await write(path.join(root, "libs/ui/button/styles.css"), ".button {}\n");

    const resolver = new CssImportResolver(root, {
      "@styles/global": ["styles/global"],
      "@libs/ui/*": ["libs/ui/*"],
    });

    expect(await resolver.resolve("@styles/global", root)).toBe(path.join(root, "styles/global.css"));
    expect(await resolver.resolve("@libs/ui/button", root)).toBe(path.join(root, "libs/ui/button/styles.css"));
    expect(await resolver.resolve("@libs/ui/missing", root)).toBeNull();
  });

  test("resolves css from single-package Akan workspace subpaths", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "pkgs/akanjs/ui/styles.css"), "body {}\n");

    const resolver = new CssImportResolver(root, {
      "akanjs/ui/*": ["pkgs/akanjs/ui/*"],
    });

    expect(await resolver.resolve("akanjs/ui/styles.css", root)).toBe(path.join(root, "pkgs/akanjs/ui/styles.css"));
  });
});

describe("CssCompiler", () => {
  test("scans installed akanjs sources while ignoring other node_modules", async () => {
    expect(isIgnoredNodeModuleSource("/repo/node_modules/react/index.js")).toBe(true);
    expect(isIgnoredNodeModuleSource("/repo/node_modules/akanjs/ui/Button.tsx")).toBe(false);
  });

  test("includes Tailwind candidates from installed akanjs ui sources", async () => {
    const root = await makeTempRoot();
    const cssPath = path.join(root, "node_modules/akanjs/ui/styles.css");
    const uiSource = path.join(root, "node_modules/akanjs/ui/Button.tsx");
    const tailwindCssPath = fileURLToPath(await import.meta.resolve("tailwindcss/index.css"));
    await write(cssPath, `@import ${JSON.stringify(tailwindCssPath)};\n@source "./**/*";\n`);
    await write(uiSource, 'export const Button = () => <button className="text-fuchsia-500" />;\n');

    const compiler = new CssCompiler({
      workspace: { workspaceRoot: root },
      // The candidate cache lands under `<cwdPath>/.akan/cache`, so point it at this test's temp root
      // rather than wherever the suite happens to run from.
      cwdPath: root,
      getTsConfig: async () => ({ compilerOptions: { paths: {} } }),
    } as never);
    const css = await compiler.compileCss([cssPath], []);

    expect(css).toContain(".text-fuchsia-500");
  });
});
