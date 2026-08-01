import { describe, expect, test } from "bun:test";
import type { BuilderMessage, DevBuildStatus, DevChangeAction } from "akanjs/server";
import {
  backendRestartReasonFromMessage,
  buildStatusReplaySequence,
  createBackendBuildStatus,
  hasBuildFailureForGeneration,
  isLegacyBackendFallbackFile,
  mergeBackendRestartReasons,
  mergeInvalidateMessages,
  normalizeBackendReportedGeneration,
  shouldAbandonBackendRecovery,
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

describe("backend recovery abandonment", () => {
  test("keeps retrying below the attempt ceiling and abandons at it", () => {
    expect(shouldAbandonBackendRecovery(0)).toBe(false);
    expect(shouldAbandonBackendRecovery(4)).toBe(false);
    expect(shouldAbandonBackendRecovery(5)).toBe(true);
    expect(shouldAbandonBackendRecovery(9)).toBe(true);
  });

  test("honors a custom attempt ceiling", () => {
    expect(shouldAbandonBackendRecovery(2, 3)).toBe(false);
    expect(shouldAbandonBackendRecovery(3, 3)).toBe(true);
  });
});

describe("hasBuildFailureForGeneration", () => {
  const status = (phase: DevBuildStatus["phase"], generation: number, ok: boolean): DevBuildStatus => ({
    generation,
    phase,
    ok,
    files: [],
  });

  test("detects a failing phase recorded for the same generation", () => {
    const statusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([
      ["csr", status("csr", 3, false)],
      ["barrel", status("barrel", 3, true)],
    ]);
    expect(hasBuildFailureForGeneration(statusByPhase, 3)).toBe(true);
  });

  test("ignores stale failures from earlier generations", () => {
    const statusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([
      ["csr", status("csr", 3, false)],
      ["barrel", status("barrel", 4, true)],
    ]);
    expect(hasBuildFailureForGeneration(statusByPhase, 4)).toBe(false);
  });

  test("treats unknown generations and green boards as healthy", () => {
    const statusByPhase = new Map<DevBuildStatus["phase"], DevBuildStatus>([["csr", status("csr", 3, false)]]);
    expect(hasBuildFailureForGeneration(statusByPhase, undefined)).toBe(false);
    expect(hasBuildFailureForGeneration(new Map(), 3)).toBe(false);
  });
});

describe("mergeInvalidateMessages", () => {
  const invalidate = (
    generation: number,
    files: string[],
    actions: DevChangeAction[],
  ): Extract<BuilderMessage, { type: "invalidate" }> => ({
    type: "invalidate",
    kinds: ["code"],
    files,
    generation,
    devPlan: {
      generation,
      files,
      generatedFiles: [],
      roles: ["shared"],
      actions,
      reasonByFile: { [files[0] ?? "/repo/a.ts"]: ["shared-path"] },
    },
  });

  test("unions files, kinds, and actions while keeping the latest generation", () => {
    const merged = mergeInvalidateMessages(
      invalidate(3, ["/repo/b.ts", "/repo/a.ts"], ["restart-builder"]),
      invalidate(5, ["/repo/c.ts"], ["rebuild-client"]),
    );

    expect(merged.generation).toBe(5);
    expect(merged.files).toEqual(["/repo/a.ts", "/repo/b.ts", "/repo/c.ts"]);
    expect(merged.devPlan?.generation).toBe(5);
    expect(merged.devPlan?.actions).toEqual(["rebuild-client", "restart-builder"]);
  });

  test("keeps the surviving devPlan when only one side carries one", () => {
    const withPlan = invalidate(3, ["/repo/a.ts"], ["restart-builder"]);
    const withoutPlan: Extract<BuilderMessage, { type: "invalidate" }> = {
      type: "invalidate",
      kinds: ["css"],
      files: ["/repo/style.css"],
      generation: 4,
    };

    const merged = mergeInvalidateMessages(withPlan, withoutPlan);
    expect(merged.devPlan?.actions).toEqual(["restart-builder"]);
    expect(merged.kinds).toEqual(["code", "css"]);
    expect(merged.generation).toBe(4);
  });

  test("merges per-file reasons without duplicating entries", () => {
    const current = invalidate(3, ["/repo/a.ts"], ["restart-builder"]);
    const next = invalidate(4, ["/repo/a.ts"], ["restart-builder"]);
    const nextPlan = next.devPlan;
    if (!nextPlan) throw new Error("devPlan expected");
    nextPlan.reasonByFile["/repo/a.ts"] = ["runtime-metadata", "shared-path"];

    const merged = mergeInvalidateMessages(current, next);
    expect(merged.devPlan?.reasonByFile["/repo/a.ts"]).toEqual(["runtime-metadata", "shared-path"]);
  });
});

describe("normalizeBackendReportedGeneration", () => {
  test("drops the gateway's unknown-generation sentinel", () => {
    expect(normalizeBackendReportedGeneration(-1)).toBeUndefined();
  });

  test("keeps real generations including zero", () => {
    expect(normalizeBackendReportedGeneration(0)).toBe(0);
    expect(normalizeBackendReportedGeneration(7)).toBe(7);
  });
});
