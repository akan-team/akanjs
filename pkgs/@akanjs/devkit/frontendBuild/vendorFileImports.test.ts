import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { printedInOwnProcess, tempDirs, writeText as write } from "../test/testHelpers";
import { VendorFileImports } from "./vendorFileImports";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

const makeTempRoot = tempDirs("akan-vendor-files-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const inAkanjs = (file: string) => path.join(akanjsRoot, file);

describe("VendorFileImports.vendorOf", () => {
  const files = new VendorFileImports(akanjsRoot, VENDOR_SPECIFIERS);

  test("a file its vendor's barrel re-exports whole comes from that vendor, by any path", () => {
    expect(files.vendorOf("../../client/cn", inAkanjs("ui/recipe/factory.ts"))).toBe("akanjs/client");
    expect(files.vendorOf("../client/sharedContext", inAkanjs("ui/overlayLayer.ts"))).toBe("akanjs/client");
    expect(files.vendorOf("./device", inAkanjs("client/keyboardRide.ts"))).toBe("akanjs/client");
    expect(files.vendorOf(inAkanjs("client/csrTypes.ts"), "/app/.akan/generated/wrapper.tsx")).toBe("akanjs/client");
    expect(files.vendorOf("akanjs/client", inAkanjs("ui/overlayLayer.ts"))).toBe("akanjs/client");
  });

  test("a file the barrel leaves out stays the importer's", () => {
    expect(files.vendorOf("../../client/rscRoutePatch", inAkanjs("ui/System/Client.tsx"))).toBeNull();
    expect(files.vendorOf("akanjs/client/native", inAkanjs("ui/overlayLayer.ts"))).toBeNull();
    expect(files.vendorOf("../../store/openSeq", inAkanjs("ui/Model/LoadStore.tsx"))).toBeNull();
    expect(files.vendorOf("../webkit/useTransitionStore", inAkanjs("server/rscClient.tsx"))).toBeNull();
    expect(files.vendorOf("react", inAkanjs("ui/overlayLayer.ts"))).toBeNull();
  });

  test("a file of another vendor stays the importer's, even one its barrel re-exports whole", () => {
    expect(files.vendorOf("../../store/action", inAkanjs("ui/Model/LoadStore.tsx"))).toBeNull();
    expect(files.vendorOf("akanjs/base/akanError", inAkanjs("ui/overlayLayer.ts"))).toBeNull();
    expect(files.vendorOf("../common/akanNames", inAkanjs("client/device.ts"))).toBeNull();
  });

  test("without an akanjs to read, every vendor stays external and no file maps to one", () => {
    const unread = new VendorFileImports(null, VENDOR_SPECIFIERS);
    expect(unread.specifiers).toEqual(VENDOR_SPECIFIERS);
    expect(unread.vendorOf("../../client/cn", inAkanjs("ui/recipe/factory.ts"))).toBeNull();
  });
});

describe("VendorFileImports.wholeReexports", () => {
  test("lists only the files a barrel re-exports in full under their own names, none it shadows", async () => {
    const root = await makeTempRoot();
    const files: Record<string, string> = {
      "named.ts": "export const a = 1;\nexport const b = 2;\n",
      "starred.ts": "export const c = 1;\n",
      "partial.ts": "export const d = 1;\nexport const e = 2;\n",
      "renamed.ts": "export const f = 1;\n",
      "clashA.ts": "export const g = 1;\n",
      "clashB.ts": "export const g = 2;\n",
      "forwarding.ts": 'export * from "./named";\n',
      "typed.ts": "export interface T {\n  t: number;\n}\n",
      "shadowed.ts": "export const h = 1;\n",
      "shadowedByList.ts": "export const k = 1;\n",
      "index.ts": [
        'export { a, b } from "./named";',
        'export * from "./starred";',
        'export { d } from "./partial";',
        'export { f as renamedF } from "./renamed";',
        'export * from "./clashA";',
        'export * from "./clashB";',
        'export * from "./forwarding";',
        'export type { T } from "./typed";',
        'export * from "./shadowed";',
        "export const h = 2;",
        'export * from "./shadowedByList";',
        "const k = 2;",
        "export { k };",
        "",
      ].join("\n"),
    };
    for (const [name, source] of Object.entries(files)) await write(path.join(root, name), source);

    const whole = VendorFileImports.wholeReexports(path.join(root, "index.ts")).map((file) => path.basename(file));

    expect(whole.sort((a, b) => a.localeCompare(b))).toEqual(["named.ts", "starred.ts"]);
  });
});

describe("VendorFileImports.plugin", () => {
  test("a static import of a covered file becomes the vendor; a dynamic one stays a chunk of the build", async () => {
    const root = await makeTempRoot();
    const pkg = path.join(root, "akanjs");
    await write(path.join(pkg, "client/index.ts"), 'export * from "./cn";\nexport * from "./lazy";\n');
    await write(path.join(pkg, "client/cn.ts"), 'export const cn = () => "cn-marker";\n');
    await write(path.join(pkg, "client/lazy.ts"), 'export const lazy = () => "lazy-marker";\n');
    await write(
      path.join(root, "entry.ts"),
      'import { cn } from "./akanjs/client/cn";\nexport const run = async () => [cn(), (await import("./akanjs/client/lazy")).lazy()];\n',
    );
    const result = await Bun.build({
      entrypoints: [path.join(root, "entry.ts")],
      outdir: path.join(root, "out"),
      splitting: true,
      format: "esm",
      plugins: [new VendorFileImports(pkg, ["akanjs/client"]).plugin()],
    });
    const code = (await Promise.all(result.outputs.map((output) => output.text()))).join("\n");

    expect(code).toContain('from "akanjs/client"');
    expect(code).not.toContain("cn-marker");
    expect(code).toContain("lazy-marker");
  });
});

interface BuildsReport {
  builds: number;
  runtimeHoldsDevice: boolean;
  shared: string[];
}
const nativeBridge =
  "the native bridge the barrel leaves out: the vendor's device.ts and storage.ts import it lazily, the page by path, and only the CSR shell loads either";
const underNativeBridge = "imported by the native bridge, so written with each of its two copies";
const allowedInBoth: Record<string, string> = {
  "akanjs/client/native.ts": nativeBridge,
  "@akanjs/native/packages/core/src/acl.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/boot.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/contract.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/errors.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/kernel.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/live.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/plugin.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/protocol.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/runtime.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/state.ts": underNativeBridge,
  "@akanjs/native/packages/core/src/veto.ts": underNativeBridge,
  "@akanjs/native/packages/react/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/app-state/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/app-state/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/app/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/app/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/auth-session/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/browser/src/args.ts": underNativeBridge,
  "@akanjs/native/plugins/browser/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/browser/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/device/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/device/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/dialog/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/dialog/src/options.ts": underNativeBridge,
  "@akanjs/native/plugins/dialog/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/file-picker/src/common.ts": underNativeBridge,
  "@akanjs/native/plugins/file-picker/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/file-picker/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/haptics/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/haptics/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/keyboard/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/keyboard/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/opener/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/opener/src/url.ts": underNativeBridge,
  "@akanjs/native/plugins/opener/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/preferences/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/preferences/src/web.ts": underNativeBridge,
  "@akanjs/native/plugins/push/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/secure-storage/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/updates/src/index.ts": underNativeBridge,
  "@akanjs/native/plugins/volume/src/index.ts": underNativeBridge,
};

describe("a page's two browser builds", () => {
  test("share only the native bridge the CSR shell loads, by the barrel, a linked path, a relative one or `akanjs/client/native`", async () => {
    const root = await realpath(await makeTempRoot());
    const appDir = path.join(root, "apps/demo");
    await mkdir(path.join(root, "pkgs"), { recursive: true });
    await symlink(akanjsRoot, path.join(root, "pkgs/akanjs"), "dir");
    const paths = { "@apps/*": ["./apps/*"], "akanjs/*": ["./pkgs/akanjs/*"] };
    await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths } }));
    await write(path.join(appDir, "lib/useClient.ts"), "export const usePage = () => 1;\n");
    await write(path.join(appDir, "lib/st.ts"), "export const st = Object.freeze({});\n");
    await write(
      path.join(appDir, "ui/Barrel.tsx"),
      '"use client";\nimport { cn, Device, sharedContext } from "akanjs/client";\nexport const Barrel = () => [cn("a"), Device.name, sharedContext];\n',
    );
    await write(
      path.join(appDir, "ui/Relative.tsx"),
      '"use client";\nimport { cn } from "../../../pkgs/akanjs/client/cn";\nexport const Relative = () => cn("b");\n',
    );
    await write(
      path.join(appDir, "ui/Native.tsx"),
      '"use client";\nimport { isNativeApp } from "akanjs/client/native";\nexport const Native = () => isNativeApp();\n',
    );
    const linked = path.join(root, "pkgs/akanjs");
    const entries = [
      path.join(appDir, "ui/Barrel.tsx"),
      path.join(appDir, "ui/Relative.tsx"),
      path.join(appDir, "ui/Native.tsx"),
      path.join(linked, "client/device.ts"),
      path.join(linked, "client/sharedContext.ts"),
      path.join(linked, "client/csrTypes.ts"),
      path.join(linked, "ui/UiOverride/UiOverride.tsx"),
    ];

    const { shared, ...builds } = (await printedInOwnProcess(
      `
const fs = await import("node:fs");
const path = await import("node:path");
const dir = ${JSON.stringify(import.meta.dir)};
const { RouteClientBuilder } = await import(path.join(dir, "routeClientBuilder.ts"));
const { SsrBaseArtifactBuilder } = await import(path.join(dir, "ssrBaseArtifactBuilder.ts"));
const { VendorImportScanner } = await import(path.join(dir, "vendorImportScanner.ts"));
const { NARROWABLE_VENDOR_SPECIFIERS } = await import(path.join(dir, "vendorSpecifiers.ts"));
const [root, entries, paths] = ${JSON.stringify([root, entries, paths])};
const builds = [];
const build = Bun.build;
Bun.build = async (config) => {
  const result = await build(config);
  if (config.target === "browser") builds.push({ entrypoints: config.entrypoints, metafile: result.metafile });
  return result;
};
const app = {
  name: "demo",
  cwdPath: root + "/apps/demo",
  dist: { cwdPath: root + "/dist/apps/demo" },
  workspace: { workspaceRoot: root },
  getConfig: async () => ({ barrelImports: [], optimizeImports: [], clientRuntime: "all" }),
  getTsConfig: async () => ({ compilerOptions: { paths } }),
  getPublicEnv: () => ({}),
  logger: { warn: () => {} },
  verbose: () => {},
};
const routes = await new RouteClientBuilder({ app, seeds: [], entries, command: "build", browser: "chunks" }).build();
const vendorExports = await VendorImportScanner.exportsUsedIn(
  root + "/dist/apps/demo/.akan/artifact/client",
  NARROWABLE_VENDOR_SPECIFIERS,
  Object.values(routes.manifestDelta).map(({ id }) => id),
);
await new SsrBaseArtifactBuilder(app, "build", { vendorExports }).buildRuntimeClientEntries();
const modulesOf = ({ metafile }) => {
  const modules = new Set();
  for (const output of Object.values(metafile.outputs))
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      const file = path.resolve(root, input);
      if (bytesInOutput > 0 && fs.existsSync(file)) modules.add(fs.realpathSync(file));
    }
  return modules;
};
const [routeBuild, runtimeBuild] = builds.map(modulesOf);
const pkgs = ${JSON.stringify(path.dirname(akanjsRoot))};
console.log(JSON.stringify({
  builds: builds.length,
  runtimeHoldsDevice: runtimeBuild.has(path.join(pkgs, "akanjs/client/device.ts")),
  shared: [...routeBuild].filter((file) => runtimeBuild.has(file)).map((file) => path.relative(pkgs, file)).sort(),
}));
`,
      root,
    )) as BuildsReport;

    expect(builds).toEqual({ builds: 2, runtimeHoldsDevice: true });
    expect(shared).toContain("akanjs/client/native.ts");
    expect(shared.filter((file) => !Object.hasOwn(allowedInBoth, file))).toEqual([]);
  }, 120_000);
});
