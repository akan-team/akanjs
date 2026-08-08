import { describe, expect, test } from "bun:test";
import { appRootAllowedDirs, appRootAllowedFiles, isScannedAppRootEntry } from "./workspaceLayout";

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
    expect(isScannedAppRootEntry(".DS_Store")).toBe(false);
    expect(isScannedAppRootEntry(".akan")).toBe(true);
    expect(isScannedAppRootEntry("lib")).toBe(true);
  });
});
