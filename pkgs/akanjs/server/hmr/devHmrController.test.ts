import { describe, expect, test } from "bun:test";
import type { DevBuildStatus } from "../artifact";
import {
  devBuildStatusToHmrMessage,
  isAkanRuntimeMetadataFile,
  manifestClientEntriesForFiles,
} from "./devHmrController";

describe("DevHmrController runtime metadata detection", () => {
  test("detects generated app client runtime metadata files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/useClient.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/dict.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/sig.ts")).toBe(true);
  });

  test("detects app and library dictionary/signal module files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/_akan/akan.dictionary.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/_akan/akan.signal.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/libs/shared/lib/admin/admin.dictionary.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/libs/shared/lib/admin/admin.signal.ts")).toBe(true);
  });

  test("ignores unrelated source files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/page/_index.tsx")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/task/task.service.ts")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/task/dictionary.ts")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/page/example.signal.ts")).toBe(false);
  });
});

describe("DevHmrController client manifest entry detection", () => {
  test("detects changed client entries from relative manifest keys", () => {
    const workspaceRoot = "/repo";
    const changed = manifestClientEntriesForFiles(
      ["/repo/apps/demo/ui/Header.tsx"],
      {
        "apps/demo/ui/Header.tsx#Header": {
          id: "/_akan/client/header.js",
          chunks: ["/_akan/client/header.js"],
          name: "Header",
          async: true,
        },
        "apps/demo/ui/Footer.tsx#Footer": {
          id: "/_akan/client/footer.js",
          chunks: ["/_akan/client/footer.js"],
          name: "Footer",
          async: true,
        },
      },
      workspaceRoot,
    );

    expect(changed).toEqual(new Set(["/repo/apps/demo/ui/Header.tsx"]));
  });
});

describe("DevHmrController build status HMR messages", () => {
  const status = (overrides: Partial<DevBuildStatus>): DevBuildStatus => ({
    generation: 1,
    phase: "pages",
    ok: false,
    files: ["/repo/apps/demo/page/_index.tsx"],
    message: "Build failed",
    ...overrides,
  });

  test("broadcasts failed build status as an error overlay message", () => {
    expect(devBuildStatusToHmrMessage(status({ generation: 12, phase: "css" }))).toEqual({
      type: "build-status",
      status: "error",
      generation: 12,
      phase: "css",
      message: "Build failed",
      files: 1,
    });
  });

  test("broadcasts ok only when a newer status recovers a failed phase", () => {
    const previous = status({ generation: 12, phase: "pages", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 11, phase: "pages", ok: true }), previous)).toBeNull();
    expect(devBuildStatusToHmrMessage(status({ generation: 13, phase: "css", ok: true }))).toBeNull();
    expect(devBuildStatusToHmrMessage(status({ generation: 13, phase: "pages", ok: true }), previous)).toEqual({
      type: "build-status",
      status: "ok",
      generation: 13,
      phase: "pages",
      message: "Build failed",
      files: 1,
    });
  });

  test("does not clear a failure with a stale recovered generation", () => {
    const previous = status({ generation: 22, phase: "csr", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 21, phase: "csr", ok: true }), previous)).toBeNull();
  });

  test("allows same generation backend recovery after a restart succeeds", () => {
    const previous = status({ generation: 12, phase: "backend", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 12, phase: "backend", ok: true }), previous)).toEqual({
      type: "build-status",
      status: "ok",
      generation: 12,
      phase: "backend",
      message: "Build failed",
      files: 1,
    });
  });
});
