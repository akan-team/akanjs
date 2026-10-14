// The one source of the app/lib root allowlists (sync, doctor and quality scan read it); mirror a change into the
// root AGENTS.md list.

export type SysType = "app" | "lib";

export const appRootAllowedFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "akan.app.json",
  "akan.config.ts",
  "client.ts",
  "main.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
]);

export const appRootAllowedDirs = new Set([
  ".akan",
  "common",
  "env",
  "lib",
  "native",
  "page",
  "plugin",
  "private",
  "public",
  "script",
  "secrets",
  "srvkit",
  "ui",
  "webkit",
]);

// A library is never booted or packaged as an app, so the run/mobile entries are out; it is published, so README stays.
export const libRootAllowedFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "akan.config.ts",
  "akan.lib.json",
  "client.ts",
  "index.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
  "tsconfig.spec.json",
  "tsconfig.tsbuildinfo",
]);

export const libRootAllowedDirs = new Set([
  "common",
  "env",
  "lib",
  "native",
  "page",
  "plugin",
  "private",
  "public",
  "srvkit",
  "ui",
  "webkit",
]);

export const rootAllowedFiles = { app: appRootAllowedFiles, lib: libRootAllowedFiles } as const;
export const rootAllowedDirs = { app: appRootAllowedDirs, lib: libRootAllowedDirs } as const;

export const libFacetRootAllowedFiles = new Set([
  "cnst.ts",
  "db.ts",
  "dict.ts",
  "option.ts",
  "sig.ts",
  "srv.ts",
  "st.ts",
  "useClient.ts",
  "useServer.ts",
]);

export const isAllowedLibFacetRootFile = (filename: string) => libFacetRootAllowedFiles.has(filename);

const testSuffix = /\.(test|spec)(\.tsx?)$/;

export const libFacetRootHintOf = (filename: string) =>
  testSuffix.test(filename)
    ? "a test beside the generated barrels; move it into the module folder it covers " +
      "(lib/<model>/<model>.signal.test.ts), or into srvkit/ when it drives several modules"
    : null;

export const moduleTestTargetOf = (filename: string) =>
  testSuffix.test(filename) ? filename.replace(testSuffix, "$2") : null;

export const moduleTestHint =
  "a module test is named after the one module file it covers (<model>.<role>.test.ts); add a describe block to " +
  "that file's suite instead, or move a suite that drives several modules into srvkit/";

export const barrelFacetDirs = ["ui", "webkit", "srvkit", "common", "plugin"] as const;

//* Bun resolves a folder import to `index.tsx`, `index.jsx` or `index.mts` ahead of `index.ts`, and TypeScript to
//* `index.ts` first, so one of these beside the generated barrel typechecks every name the barrel adds and serves none.
const barrelShadowingIndexFiles = new Set(["index.tsx", "index.jsx", "index.mts"]);

export const facetIndexShadowOf = (sysRelativePath: string) => {
  const [facet, filename = "", ...nested] = sysRelativePath.split("/");
  if (nested.length || !barrelShadowingIndexFiles.has(filename) || !barrelFacetDirs.some((dir) => dir === facet))
    return null;
  return (
    `shadows the generated ${facet}/index.ts: Bun loads ${filename} and TypeScript checks index.ts, so a name only ` +
    `the generated barrel exports typechecks and is undefined at runtime. Delete it, since the generated barrel ` +
    `re-exports every file and folder in ${facet}/; a namespace it builds belongs in ${facet}/<Folder>/index.tsx`
  );
};

//* What a Capacitor app kept in its root. The native runtime generates its projects under `dist/native/<app>/<target>`, so
//* these are named as leftovers instead of as unknown entries.
const retiredAppRootEntries = new Set([
  "android",
  "ios",
  "mobile",
  "capacitor.config.ts",
  "capacitor.config.js",
  "capacitor.config.json",
]);

export const rootEntryHintOf = (type: SysType, name: string) =>
  type === "app" && retiredAppRootEntries.has(name)
    ? "a Capacitor-era entry; the native runtime generates its projects under dist/native/<app>/<target>, so delete it"
    : null;

// scanSync reads roots through `Bun.Glob("*")`, which skips dotfiles, so doctor skips them the same way.
export const isScannedRootEntry = (type: SysType, name: string) =>
  !name.startsWith(".") || rootAllowedDirs[type].has(name);
