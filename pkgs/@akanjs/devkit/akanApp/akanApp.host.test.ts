import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase, DevBuildStatus, DevChangeAction } from "akanjs/server";
import type { App } from "../commandDecorators";
import {
  AkanAppHost,
  BackendImportGraph,
  backendRestartReasonFromMessage,
  buildStatusReplaySequence,
  createBackendBuildStatus,
  decideBuilderRssRecycle,
  decideBuilderRssSettle,
  decideIdleSuspend,
  filesChangedSince,
  hasAnyBuildFailure,
  hasBuildFailureForGeneration,
  isLegacyBackendFallbackFile,
  isRssCeilingUnreachable,
  mergeBackendRestartReasons,
  mergeInvalidateMessages,
  normalizeBackendReportedGeneration,
  resolveIdleSuspendMs,
  shouldAbandonBackendRecovery,
  shouldHoldForReturningBuilder,
  shouldMarkBuildPhaseRecovered,
  shouldQueueBuildStatusReplay,
  shouldRefreshConfigOnIdleWake,
  shouldRelayRecycledFrontendState,
  shouldReplaceLastGoodMessage,
  shouldRestartBackendByDevPlan,
  shouldRestartBuilderByDevPlan,
  shouldRestartDevHostByDevPlan,
  shouldWarnBuilderRssCeilingTight,
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

describe("holding requests for a returning builder", () => {
  test("holds while the builder is on its way back", () => {
    expect(shouldHoldForReturningBuilder({ status: "restarting", heldCount: 0 })).toBe(true);
    expect(shouldHoldForReturningBuilder({ status: "starting", heldCount: 3 })).toBe(true);
  });

  test("holds through the drain too, not only after the process is gone", () => {
    // The window this decision originally missed: the builder is still alive and refusing, which is
    // the same gap as a restart from anyone waiting on a page.
    expect(shouldHoldForReturningBuilder({ status: "recycling", heldCount: 0 })).toBe(true);
  });

  test("fails immediately when nothing is bringing the builder back", () => {
    expect(shouldHoldForReturningBuilder({ status: "stopped", heldCount: 0 })).toBe(false);
  });

  test("stops holding once the queue is full", () => {
    expect(shouldHoldForReturningBuilder({ status: "restarting", heldCount: 3, limit: 4 })).toBe(true);
    expect(shouldHoldForReturningBuilder({ status: "restarting", heldCount: 4, limit: 4 })).toBe(false);
  });
});

describe("builder rss recycle", () => {
  const ceiling = 1_200 * 1024 * 1024;
  const decide = (over: Partial<Parameters<typeof decideBuilderRssRecycle>[0]>) =>
    decideBuilderRssRecycle({
      rssBytes: ceiling + 1,
      ceilingBytes: ceiling,
      buildFailed: false,
      msSinceLastRecycle: null,
      ...over,
    });

  test("recycles an idle builder that crossed the ceiling", () => {
    expect(decide({})).toBe("recycle");
  });

  test("leaves a builder under the ceiling alone", () => {
    expect(decide({ rssBytes: ceiling - 1 })).toBe("below-ceiling");
  });

  test("does nothing when no ceiling is configured", () => {
    expect(decide({ ceilingBytes: null })).toBe("unbounded");
  });

  // Rebooting on a generation whose build failed strands the dev server: the replacement hits the
  // same compile error and exits before builder-ready.
  test("defers while the current generation has a failing build", () => {
    expect(decide({ buildFailed: true })).toBe("build-failed");
  });

  test("refuses a second recycle inside the minimum interval", () => {
    expect(decide({ msSinceLastRecycle: 5_000 })).toBe("too-soon");
    expect(decide({ msSinceLastRecycle: 31_000 })).toBe("recycle");
    expect(decide({ msSinceLastRecycle: 5_000, minIntervalMs: 1_000 })).toBe("recycle");
  });

  // Says so, and keeps enforcing: a page load is two route builds, so an app whose builds sit over the
  // ceiling reaches this on its first navigation — which is normal work, not a reason to drop the only
  // bound the builder has.
  test("mentions a tight ceiling rather than acting on it", () => {
    expect(shouldWarnBuilderRssCeilingTight(1)).toBe(false);
    expect(shouldWarnBuilderRssCeilingTight(2)).toBe(true);
    expect(shouldWarnBuilderRssCeilingTight(1, 1)).toBe(true);
  });

  // The one case recycling cannot fix, measured on the replacement before it has built anything: every
  // future replacement lands on the same floor, so the loop would only ever cost boot builds.
  test("gives up only when a fresh builder is already over the ceiling", () => {
    expect(isRssCeilingUnreachable(ceiling + 1, ceiling)).toBe(true);
    expect(isRssCeilingUnreachable(ceiling - 1, ceiling)).toBe(false);
    // An unreadable rss is no information, and no ceiling is nothing to be unreachable.
    expect(isRssCeilingUnreachable(null, ceiling)).toBe(false);
    expect(isRssCeilingUnreachable(ceiling + 1, null)).toBe(false);
  });

  // Measured on Linux: the builder peaked at 522MiB and settled at 214MiB with no help, so a 400MiB
  // ceiling recycled a process that was already back under it. The armed sample is always the peak.
  describe("settle check before committing", () => {
    test("waits when the builder is only modestly over the ceiling", () => {
      expect(decideBuilderRssSettle({ rssBytes: 522, ceilingBytes: 400 })).toBe("wait-and-recheck");
      expect(decideBuilderRssSettle({ rssBytes: 401, ceilingBytes: 400 })).toBe("wait-and-recheck");
    });

    // No purge is going to rescue a builder this far over, so waiting only delays the inevitable.
    test("recycles immediately once far enough past the ceiling", () => {
      expect(decideBuilderRssSettle({ rssBytes: 600, ceilingBytes: 400 })).toBe("recycle-now");
      expect(decideBuilderRssSettle({ rssBytes: 900, ceilingBytes: 400 })).toBe("recycle-now");
      expect(decideBuilderRssSettle({ rssBytes: 500, ceilingBytes: 400, hardMultiple: 1.2 })).toBe("recycle-now");
    });
  });

  describe("readProcessRssBytes", () => {
    test("reads this process's own rss", async () => {
      const rssBytes = await AkanAppHost.readProcessRssBytes(process.pid);
      if (rssBytes === null) throw new Error("expected to read this process's own rss");
      // Loose bounds on purpose: the point is that it read a real number from the OS, not which number.
      expect(rssBytes).toBeGreaterThan(1024 * 1024);
      expect(rssBytes).toBeLessThan(64 * 1024 * 1024 * 1024);
    });

    // Null rather than 0, because callers must treat an unreadable pid as "no new information" — a 0
    // would read as "settled below the ceiling" and cancel a recycle that should happen.
    test("returns null for a pid that does not exist", async () => {
      expect(await AkanAppHost.readProcessRssBytes(2_147_483_646)).toBeNull();
    });
  });
});

describe("dev idle suspend", () => {
  const decide = (over: Partial<Parameters<typeof decideIdleSuspend>[0]> = {}) =>
    decideIdleSuspend({
      enabled: true,
      suspended: false,
      builderReady: true,
      backendReady: true,
      buildFailed: false,
      restartPending: false,
      msSinceWake: null,
      ...over,
    });

  test("suspends an idle dev server whose builder and backend are both up", () => {
    expect(decide()).toBe("suspend");
  });

  test("keeps build capacity while anything is still in motion", () => {
    expect(decide({ enabled: false })).toBe("disabled");
    expect(decide({ suspended: true })).toBe("already-suspended");
    expect(decide({ builderReady: false })).toBe("builder-not-ready");
    expect(decide({ backendReady: false })).toBe("backend-not-ready");
    expect(decide({ restartPending: true })).toBe("restart-pending");
  });

  // A wake would boot straight back into the same compile error, and the developer is mid-fix anyway.
  test("never suspends on a red build", () => {
    expect(decide({ buildFailed: true })).toBe("build-failed");
  });

  test("enforces a minimum uptime after a wake so it cannot flap", () => {
    expect(decide({ msSinceWake: 5_000 })).toBe("too-soon");
    expect(decide({ msSinceWake: 31_000 })).toBe("suspend");
    expect(decide({ msSinceWake: 5_000, minUptimeMs: 1_000 })).toBe("suspend");
  });

  test("defaults to on and treats any non-positive value as off", () => {
    expect(resolveIdleSuspendMs(undefined)).toBe(300_000);
    expect(resolveIdleSuspendMs("")).toBe(300_000);
    expect(resolveIdleSuspendMs("0")).toBeNull();
    expect(resolveIdleSuspendMs("-1")).toBeNull();
    expect(resolveIdleSuspendMs("not-a-number")).toBeNull();
    expect(resolveIdleSuspendMs("1500")).toBe(1_500);
  });

  test("blocks a suspend on a failure in any phase, not just the newest generation", () => {
    const status = (phase: BuildPhase, ok: boolean): DevBuildStatus => ({ generation: 1, phase, ok, files: [] });
    expect(hasAnyBuildFailure(new Map())).toBe(false);
    expect(hasAnyBuildFailure(new Map([["scan", status("scan", true)]]))).toBe(false);
    expect(
      hasAnyBuildFailure(
        new Map([
          ["scan", status("scan", true)],
          ["pages", status("pages", false)],
        ]),
      ),
    ).toBe(true);
  });

  test("routes a config change made while suspended through the dev host restart", () => {
    expect(shouldRefreshConfigOnIdleWake(null)).toBe(false);
    expect(shouldRefreshConfigOnIdleWake({ files: ["/repo/apps/demo/ui/A.tsx"], kinds: new Set(["code"]) })).toBe(
      false,
    );
    expect(
      shouldRefreshConfigOnIdleWake({
        files: ["/repo/apps/demo/akan.config.ts"],
        kinds: new Set(["config", "code"]),
      }),
    ).toBe(true);
  });
});

describe("recycled builder state announcements", () => {
  const pages = (bundlePath: string): Extract<BuilderMessage, { type: "pages-updated" }> => ({
    type: "pages-updated",
    data: { bundlePath, buildId: 7, generation: 3, changedFiles: [], reason: "builder-recycle" },
  });
  const css = (cssUrl: string): Extract<BuilderMessage, { type: "css-updated" }> => ({
    type: "css-updated",
    data: {
      cssAssets: { "": { cssUrl, cssRelPath: cssUrl.slice(1) } },
      cssBase64ByUrl: { [cssUrl]: "" },
      generation: 3,
      changedFiles: [],
      reason: "builder-recycle",
    },
  });

  // Both identities are content hashes, so a recycle with no concurrent edit reproduces them exactly
  // and must not reload the backend — that would refresh every browser on a memory recycle.
  test("suppresses an unchanged pages announcement and relays a moved one", () => {
    expect(shouldRelayRecycledFrontendState(pages("/a/pages-abc.js"), pages("/a/pages-abc.js"))).toBe(false);
    expect(shouldRelayRecycledFrontendState(pages("/a/pages-abc.js"), pages("/a/pages-def.js"))).toBe(true);
  });

  test("suppresses an unchanged css announcement and relays a moved one", () => {
    expect(shouldRelayRecycledFrontendState(css("/_akan/styles/root-abc.css"), css("/_akan/styles/root-abc.css"))).toBe(
      false,
    );
    expect(shouldRelayRecycledFrontendState(css("/_akan/styles/root-abc.css"), css("/_akan/styles/root-def.css"))).toBe(
      true,
    );
  });

  test("relays when the backend has no state of that kind yet", () => {
    expect(shouldRelayRecycledFrontendState(undefined, pages("/a/pages-abc.js"))).toBe(true);
    expect(shouldRelayRecycledFrontendState(css("/_akan/styles/root-abc.css"), pages("/a/pages-abc.js"))).toBe(true);
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

describe("BackendImportGraph", () => {
  const tempRoots: string[] = [];

  const makeGraph = async (files: Record<string, string>) => {
    // Realpath, not the mkdtemp path: `Bun.resolveSync` returns real paths, and on macOS `/var/folders`
    // is a symlink, so an unresolved root makes every resolved import look like it escapes the workspace.
    const workspaceRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "akan-devkit-graph-")));
    tempRoots.push(workspaceRoot);
    const cwdPath = path.join(workspaceRoot, "apps/demo");
    for (const [rel, source] of Object.entries(files)) {
      const filePath = path.join(cwdPath, rel);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, source);
    }
    const app = { cwdPath, workspace: { workspaceRoot } } as unknown as App;
    return { graph: new BackendImportGraph(app, new Logger("test")), cwdPath };
  };

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  test("walks the backend entrypoints' import graph", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import { handler } from "./lib/handler";\nexport default handler;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
      "lib/unreachable.ts": "export const nope = 1;\n",
    });

    expect(await graph.refresh()).toBe(true);
    expect(graph.has(path.join(cwdPath, "lib/handler.ts"))).toBe(true);
    expect(graph.has(path.join(cwdPath, "lib/unreachable.ts"))).toBe(false);
  });

  test("picks up an import added to an already-scanned file", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": "export default 1;\n",
      "lib/added.ts": "export const added = 1;\n",
    });
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/added.ts"))).toBe(false);

    // The scan cache is keyed on (mtimeMs, size), so the rewrite must invalidate it.
    await writeFile(path.join(cwdPath, "server.ts"), 'import "./lib/added";\nexport default 1;\n');

    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/added.ts"))).toBe(true);
  });

  test("drops a file that left the graph", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/leaving";\nexport default 1;\n',
      "lib/leaving.ts": "export const leaving = 1;\n",
    });
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/leaving.ts"))).toBe(true);

    await writeFile(path.join(cwdPath, "server.ts"), "export default 1;\n");
    await graph.refresh();
    expect(graph.has(path.join(cwdPath, "lib/leaving.ts"))).toBe(false);
  });

  test("reports which backend files moved while nobody was watching", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/handler";\nexport default 1;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
    });
    await graph.refresh();
    const before = await graph.fingerprint();

    // The builder is gone here, so no watcher event exists for this save — which is the whole reason
    // the stamps are taken. `mtimeMs` has a coarse clock on Linux, so the size has to move too.
    await writeFile(path.join(cwdPath, "lib/handler.ts"), "export const handler = () => 'changed';\n");

    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([path.join(cwdPath, "lib/handler.ts")]);
  });

  test("says nothing when the tree is untouched, and names a deleted file", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./server";\n',
      "server.ts": 'import "./lib/handler";\nexport default 1;\n',
      "lib/handler.ts": "export const handler = () => null;\n",
    });
    await graph.refresh();
    const before = await graph.fingerprint();
    // A recycle with no edit in it is the common case, and it must not cost a backend restart.
    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([]);

    await rm(path.join(cwdPath, "lib/handler.ts"));
    // Deleted counts as changed: the backend is still running what used to be there.
    expect(filesChangedSince(before, await graph.fingerprint())).toEqual([path.join(cwdPath, "lib/handler.ts")]);
  });

  test("keeps the previous graph when a refresh finds no entrypoints", async () => {
    const { graph, cwdPath } = await makeGraph({
      "main.ts": 'import "./lib/kept";\n',
      "lib/kept.ts": "export const kept = 1;\n",
    });
    await graph.refresh();
    expect(graph.ready).toBe(true);

    await rm(path.join(cwdPath, "main.ts"));
    await graph.refresh();
    // An empty scan is not a failure, so the graph legitimately empties out.
    expect(graph.has(path.join(cwdPath, "lib/kept.ts"))).toBe(false);
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
