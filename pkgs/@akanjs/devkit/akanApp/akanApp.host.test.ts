import { describe, expect, test } from "bun:test";
import type { BuilderMessage, DevBuildStatus, DevChangeAction } from "akanjs/server";
import {
  backendRestartReasonFromMessage,
  buildStatusReplaySequence,
  createBackendBuildStatus,
  isLegacyBackendFallbackFile,
  mergeBackendRestartReasons,
  shouldMarkBuildPhaseRecovered,
  shouldQueueBuildStatusReplay,
  shouldReplaceLastGoodMessage,
  shouldRestartBackendByDevPlan,
  shouldRestartBuilderByDevPlan,
  shouldRestartDevHostByDevPlan,
} from "./akanApp.host";

const invalidateWithActions = (actions: DevChangeAction[]): Extract<BuilderMessage, { type: "invalidate" }> => ({
  type: "invalidate",
  kinds: ["code"],
  files: ["/repo/libs/shared/common/foo.ts"],
  generation: 1,
  devPlan: {
    generation: 1,
    files: ["/repo/libs/shared/common/foo.ts"],
    generatedFiles: [],
    roles: ["shared"],
    actions,
    reasonByFile: {},
  },
});

describe("shouldRestartBackendByDevPlan", () => {
  test("uses explicit restart-backend action", () => {
    expect(shouldRestartBackendByDevPlan(invalidateWithActions(["restart-backend"]))).toBe(true);
  });

  test("blocks restart for error generations", () => {
    expect(shouldRestartBackendByDevPlan(invalidateWithActions(["restart-backend", "report-error"]))).toBe(false);
  });

  test("does not use backend-only restart when builder recycle is required", () => {
    expect(shouldRestartBackendByDevPlan(invalidateWithActions(["restart-backend", "restart-builder"]))).toBe(false);
  });

  test("falls back when no devPlan is present", () => {
    expect(
      shouldRestartBackendByDevPlan({
        type: "invalidate",
        kinds: ["code"],
        files: ["/repo/apps/akan/page/_index.tsx"],
      }),
    ).toBeNull();
  });
});

describe("shouldRestartDevHostByDevPlan", () => {
  test("detects explicit restart-builder actions", () => {
    expect(shouldRestartBuilderByDevPlan(invalidateWithActions(["restart-builder"]))).toBe(true);
  });

  test("detects explicit restart-dev-host actions", () => {
    expect(shouldRestartDevHostByDevPlan(invalidateWithActions(["restart-dev-host"]))).toBe(true);
  });

  test("detects legacy config invalidates", () => {
    expect(
      shouldRestartDevHostByDevPlan({
        type: "invalidate",
        kinds: ["config"],
        files: ["/repo/apps/akan/akan.config.ts"],
      }),
    ).toBe(true);
  });
});

describe("backend restart reason helpers", () => {
  test("extracts restart roles and generation from devPlan", () => {
    const message = invalidateWithActions(["restart-backend"]);
    const devPlan = message.devPlan;
    if (!devPlan) throw new Error("devPlan expected");
    message.devPlan = {
      ...devPlan,
      roles: ["client", "shared", "barrel", "css"],
      generation: 7,
    };

    expect(backendRestartReasonFromMessage(message)).toEqual({
      generation: 7,
      files: ["/repo/libs/shared/common/foo.ts"],
      roles: ["shared", "barrel"],
    });
  });

  test("merges debounced restart reasons without losing latest generation", () => {
    expect(
      mergeBackendRestartReasons(
        { generation: 12, files: ["/repo/b.ts", "/repo/a.ts"], roles: ["server"] },
        { generation: 13, files: ["/repo/b.ts", "/repo/c.ts"], roles: ["barrel", "shared"] },
      ),
    ).toEqual({
      generation: 13,
      files: ["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"],
      roles: ["server", "shared", "barrel"],
    });
  });

  test("keeps newer pending generation when an older reason is merged later", () => {
    expect(
      mergeBackendRestartReasons(
        { generation: 14, files: ["/repo/newer.ts"], roles: ["shared"] },
        { generation: 13, files: ["/repo/older.ts"], roles: ["server"] },
      ).generation,
    ).toBe(14);
  });
});

describe("last-good frontend helpers", () => {
  const pagesUpdated = (
    generation: number | undefined,
    buildId: number,
  ): Extract<BuilderMessage, { type: "pages-updated" }> => ({
    type: "pages-updated",
    data: {
      bundlePath: `/tmp/pages-${buildId}.js`,
      buildId,
      generation,
      changedFiles: [],
    },
  });

  test("accepts newer successful pages payloads", () => {
    expect(shouldReplaceLastGoodMessage(pagesUpdated(10, 1), pagesUpdated(11, 2))).toBe(true);
  });

  test("rejects stale successful pages payloads", () => {
    expect(shouldReplaceLastGoodMessage(pagesUpdated(11, 2), pagesUpdated(10, 1))).toBe(false);
  });
});

describe("build status helpers", () => {
  const status = (phase: DevBuildStatus["phase"], generation: number, ok: boolean): DevBuildStatus => ({
    generation,
    phase,
    ok,
    files: [],
  });

  test("tracks recovery by phase without unrelated phases masking failures", () => {
    const previousByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([
      ["pages", status("pages", 10, false)],
      ["css", status("css", 11, true)],
    ]);

    expect(shouldMarkBuildPhaseRecovered(previousByPhase, status("css", 12, true))).toBe(false);
    expect(shouldMarkBuildPhaseRecovered(previousByPhase, status("pages", 12, true))).toBe(true);
  });

  test("creates backend build-status payloads for lifecycle test hooks", () => {
    expect(
      createBackendBuildStatus({
        generation: 14,
        ok: false,
        files: ["/repo/libs/shared/common/foo.ts"],
        message: "Backend exited unexpectedly",
      }),
    ).toEqual({
      generation: 14,
      phase: "backend",
      ok: false,
      files: ["/repo/libs/shared/common/foo.ts"],
      message: "Backend exited unexpectedly",
    });
  });

  test("marks backend phase recovered independently", () => {
    const previousByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([
      ["backend", createBackendBuildStatus({ generation: 15, ok: false, message: "Backend exited" })],
      ["pages", status("pages", 16, false)],
    ]);

    expect(shouldMarkBuildPhaseRecovered(previousByPhase, createBackendBuildStatus({ generation: 15, ok: true }))).toBe(
      true,
    );
  });

  test("keeps backend failure and recovery statuses ordered for backend replay", () => {
    const failed = createBackendBuildStatus({ generation: 15, ok: false, message: "Backend exited" });
    const recovered = createBackendBuildStatus({ generation: 15, ok: true, message: "Backend ready" });
    const latestByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([["backend", recovered]]);

    expect(shouldQueueBuildStatusReplay(false, 0)).toBe(true);
    expect(shouldQueueBuildStatusReplay(true, 1)).toBe(true);
    expect(shouldQueueBuildStatusReplay(true, 0)).toBe(false);
    expect(buildStatusReplaySequence([failed, recovered], latestByPhase).slice(0, 2)).toEqual([failed, recovered]);
  });
});

describe("legacy backend graph fallback", () => {
  const root = "/repo";

  test("treats server and shared path roles as backend restart candidates", () => {
    expect(isLegacyBackendFallbackFile(`${root}/libs/shared/srvkit/foo.ts`, root)).toBe(true);
    expect(isLegacyBackendFallbackFile(`${root}/libs/shared/common/foo.ts`, root)).toBe(true);
    expect(isLegacyBackendFallbackFile(`${root}/libs/shared/lib/admin/admin.signal.ts`, root)).toBe(true);
  });

  test("does not restart backend for client-only path roles", () => {
    expect(isLegacyBackendFallbackFile(`${root}/libs/shared/ui/Foo.tsx`, root)).toBe(false);
    expect(isLegacyBackendFallbackFile(`${root}/apps/akan/page/_index.tsx`, root)).toBe(false);
  });
});
