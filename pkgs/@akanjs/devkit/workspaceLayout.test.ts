import { describe, expect, test } from "bun:test";
import {
  appRootAllowedDirs,
  appRootAllowedFiles,
  isAllowedLibFacetRootFile,
  isScannedRootEntry,
  libRootAllowedDirs,
  libRootAllowedFiles,
} from "./workspaceLayout";

describe("app root layout allowlist", () => {
  test("admits the scoped agent guides sync writes into every app", () => {
    expect(appRootAllowedFiles.has("AGENTS.md")).toBe(true);
    expect(appRootAllowedFiles.has("CLAUDE.md")).toBe(true);
  });

  test("admits every documented app root folder", () => {
    for (const dirname of ["mobile", "plugin", "secrets", "srvkit", "webkit"]) {
      expect(appRootAllowedDirs.has(dirname)).toBe(true);
    }
  });

  test("rejects an app root entry no facet owns", () => {
    expect(appRootAllowedFiles.has("helper.ts")).toBe(false);
    expect(appRootAllowedDirs.has("base")).toBe(false);
  });

  test("skips dotfile artifacts the sync glob never sees, but keeps .akan", () => {
    expect(isScannedRootEntry("app", ".DS_Store")).toBe(false);
    expect(isScannedRootEntry("app", ".akan")).toBe(true);
    expect(isScannedRootEntry("app", "lib")).toBe(true);
  });
});

describe("lib root layout allowlist", () => {
  test("admits what the libRoot template and scan write", () => {
    for (const filename of ["AGENTS.md", "akan.config.ts", "akan.lib.json", "client.ts", "index.ts", "server.ts"]) {
      expect(libRootAllowedFiles.has(filename)).toBe(true);
    }
    for (const dirname of ["common", "env", "lib", "page", "plugin", "private", "public", "srvkit", "ui", "webkit"]) {
      expect(libRootAllowedDirs.has(dirname)).toBe(true);
    }
  });

  test("rejects a lib root entry no facet owns", () => {
    expect(libRootAllowedFiles.has("helper.ts")).toBe(false);
    expect(libRootAllowedDirs.has("base")).toBe(false);
  });

  test("rejects the app-only run and mobile entries", () => {
    for (const filename of ["main.ts", "capacitor.config.ts", "akan.app.json"]) {
      expect(libRootAllowedFiles.has(filename)).toBe(false);
    }
    for (const dirname of [".akan", "android", "ios", "mobile", "script", "secrets"]) {
      expect(libRootAllowedDirs.has(dirname)).toBe(false);
    }
  });

  test("skips dotfile artifacts in a lib root too", () => {
    expect(isScannedRootEntry("lib", ".gitignore")).toBe(false);
    expect(isScannedRootEntry("lib", ".akan")).toBe(false);
    expect(isScannedRootEntry("lib", "ui")).toBe(true);
  });
});

describe("lib facet root allowlist", () => {
  test("admits the generated support facets and a root signal test", () => {
    expect(isAllowedLibFacetRootFile("cnst.ts")).toBe(true);
    expect(isAllowedLibFacetRootFile("option.ts")).toBe(true);
    expect(isAllowedLibFacetRootFile("user.signal.test.ts")).toBe(true);
    expect(isAllowedLibFacetRootFile("user.signal.spec.ts")).toBe(true);
  });

  test("rejects a hand-written file beside the barrels", () => {
    expect(isAllowedLibFacetRootFile("helper.ts")).toBe(false);
    expect(isAllowedLibFacetRootFile("user.test.ts")).toBe(false);
  });
});
