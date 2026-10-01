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

/** `<model>.signal.test.ts` — lib 파싯 루트에 놓이는 유일한 비생성 파일 (테스트가 배럴 전체를 부팅한다). */
const libFacetRootTestPattern = /^[A-Za-z][A-Za-z0-9_-]*\.signal\.(test|spec)\.(ts|tsx)$/;

export const isAllowedLibFacetRootFile = (filename: string) =>
  libFacetRootAllowedFiles.has(filename) || libFacetRootTestPattern.test(filename);

//* What a Capacitor app kept in its root. The native runtime generates its projects under `.akan/native/<target>`, so
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
    ? "a Capacitor-era entry; the native runtime generates its projects under .akan/native/<target>, so delete it"
    : null;

// scanSync reads roots through `Bun.Glob("*")`, which skips dotfiles, so doctor skips them the same way.
export const isScannedRootEntry = (type: SysType, name: string) =>
  !name.startsWith(".") || rootAllowedDirs[type].has(name);
