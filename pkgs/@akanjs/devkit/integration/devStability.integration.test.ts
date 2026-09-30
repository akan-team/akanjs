import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { DevGeneratedIndexSync } from "../frontendBuild";
import { DevStabilityHarness, type DevStabilityHmrProbe } from "./devStabilityHarness";

const integrationEnabled = process.env.AKAN_DEV_STABILITY_INTEGRATION === "1";
// Contention pushes a cold dev-server boot from ~3s to nearly a minute; 120s ran out mid-restart.
const INTEGRATION_TIMEOUT_MS = 180_000;
const MB = 1024 * 1024;
const harnesses: DevStabilityHarness[] = [];

const integrationTest = (name: string, fn: () => Promise<void>): void => {
  if (integrationEnabled) test(name, fn, INTEGRATION_TIMEOUT_MS);
  else test.skip(name, fn);
};

const createHarness = async (): Promise<DevStabilityHarness> => {
  const harness = new DevStabilityHarness();
  harnesses.push(harness);
  await harness.createFixture();
  return harness;
};

const isRefreshMessage = (msg: unknown): boolean =>
  typeof msg === "object" &&
  msg !== null &&
  "type" in msg &&
  (msg.type === "ssr-update" || msg.type === "rsc-refresh" || msg.type === "reload");

const isBuildStatus =
  (status: "error" | "ok") =>
  (msg: unknown): boolean =>
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === "build-status" &&
    "status" in msg &&
    msg.status === status;

// The hub does not replay (`akanjs/server/hmr/wsHub.ts`), so a miss across a probe reconnect proves nothing.
const expectHmrMessage = async (
  probe: DevStabilityHmrProbe,
  mark: number,
  predicate: (message: unknown) => boolean,
  what: string,
): Promise<void> => {
  const reconnectsBefore = probe.reconnects;
  const seen = await probe
    .waitForMessageSince(mark, predicate, 20_000)
    .then(() => true)
    .catch(() => false);
  if (seen || probe.reconnects !== reconnectsBefore) return;
  throw new Error(`${what} never reached the HMR socket, and the connection held the whole time`);
};

const waitForFileIncludes = async (filePath: string, text: string, timeoutMs = 5_000): Promise<string | null> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const file = Bun.file(filePath);
    const contents = (await file.exists()) ? await file.text() : "";
    if (contents.includes(text)) return contents;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
};

interface GatewayHealth {
  status: string;
  pid?: number;
  children: Array<{ idx: number; role: string; status: string; ready: boolean; pid?: number }>;
}

const fetchGatewayHealth = async (port: number): Promise<GatewayHealth | null> => {
  const res = await fetch(`http://127.0.0.1:${port}/_akan/app/health`).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as GatewayHealth;
};

const waitForGatewayHealth = async (
  port: number,
  predicate: (health: GatewayHealth) => boolean,
  timeoutMs = 60_000,
): Promise<GatewayHealth> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const health = await fetchGatewayHealth(port);
    if (health && predicate(health)) return health;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for gateway health on port ${port}`);
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitForProcessesGone = async (pids: number[], timeoutMs = 15_000): Promise<boolean> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (pids.every((pid) => !isProcessAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

// `cleanup()` can overrun Bun's default 5s hook budget, and a hook timeout fails the already-passed test.
const HOOK_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  if (!integrationEnabled) return;
  // A killed run leaves its fixture and dev host behind, holding ports and shifting every app index.
  const swept = await DevStabilityHarness.sweepAbandonedFixtures(DevStabilityHarness.defaultWorkspaceRoot);
  if (swept.length) console.info(`[harness] swept ${swept.length} abandoned fixture(s): ${swept.join(", ")}`);
}, HOOK_TIMEOUT_MS);

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
}, HOOK_TIMEOUT_MS);

afterAll(() => {
  if (!integrationEnabled) return;
  const { edits, retried } = DevStabilityHarness.editStats();
  // A retry is a save Bun's `fs.watch` dropped — a product bug users hit too, which this suite passes around.
  console.info(`[harness] ${edits} observed edit(s), ${retried} needed a retry after a dropped watch event`);
  const slowest = DevStabilityHarness.waitStats();
  if (slowest.length)
    console.info(`[harness] slowest waits: ${slowest.map((wait) => `${wait.ms}ms ${wait.label}`).join(" | ")}`);
});

describe("dev stability integration harness", () => {
  integrationTest("server-only valid edits restart backend without client refresh", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const hmrMark = hmr?.mark() ?? 0;

    const { mark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "srvkit/backendMarker.ts",
        `export const backendMarker = "updated-backend-marker-${attempt}";\n`,
      ),
    );

    await host.waitForLogSince(mark, /\[backend-reload\]|Shutting down gracefully|stopping backend/);
    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/);
    expect(host.proc.killed).toBe(false);
    expect(host.logs.join("").slice(mark)).not.toMatch(/\[hmr\].*rsc-refresh|\[ssr\] registry generation/);
    await hmr?.waitForNoMessageSince(hmrMark, isRefreshMessage);
    hmr?.close();
  });

  integrationTest(
    "server edits landing while a restart stops the backend leave the port to the backend it tracks",
    async () => {
      const harness = await createHarness();
      const host = await harness.startHost();
      const port = await harness.resolvePort();
      const writeMarker = (label: string) =>
        harness.writeFile("srvkit/backendMarker.ts", `export const backendMarker = "${label}";\n`);

      const { mark } = await harness.editUntilSeen(host, (attempt) => writeMarker(`burst-first-${attempt}`), {
        evidence: /stopping backend pid=\d+/,
      });
      // Each lands past the 120ms debounce, so a restart timer fires while the one before still waits for its exit.
      for (let idx = 0; idx < 8; idx++) {
        await writeMarker(`burst-${idx}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      const trackedPid = () =>
        [
          ...host.logs
            .join("")
            .slice(mark)
            .matchAll(/backend spawned pid=(\d+)/g),
        ].at(-1)?.[1];
      const settled = await waitForGatewayHealth(
        port,
        (health) => String(health.pid) === trackedPid() && health.children.some((child) => child.ready),
      );
      expect(String(settled.pid)).toBe(trackedPid() ?? "");
      const since = host.logs.join("").slice(mark);
      expect(since).not.toMatch(/already in use|not starting a second one/);
    },
  );

  integrationTest("client-only valid edits refresh browser state without backend restart", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const initialHtml = await harness.tryWaitForHttpText("initial-client-marker", 3_000);
    if (!initialHtml) {
      expect(host.proc.killed).toBe(false);
      hmr?.close();
      return;
    }
    const hmrMark = hmr?.mark() ?? 0;

    const { mark } = await harness.editUntilSeen(
      host,
      (attempt) =>
        harness.replaceText(
          "ui/ClientMarker.tsx",
          /(initial|updated)-client-marker(-\d+)?/,
          `updated-client-marker-${attempt}`,
        ),
      { evidence: /\[dev-plan\].*roles=.*client.*actions=.*rebuild-client/ },
    );

    if (hmr) {
      await expectHmrMessage(hmr, hmrMark, isRefreshMessage, "a client refresh");
    } else {
      await host.waitForLogSince(
        mark,
        /\[hmr\].*(rsc-refresh|reload)|\[ssr\] registry generation|\[SSR\] pages-updated/,
      );
    }
    expect(host.logs.join("").slice(mark)).not.toMatch(/\[backend-reload\]/);
    hmr?.close();
  });

  integrationTest("shared valid edits rebuild client and restart backend in one generation", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const initialHtml = await harness.tryWaitForHttpText("initial-shared-marker", 3_000);
    if (!initialHtml) {
      expect(host.proc.killed).toBe(false);
      hmr?.close();
      return;
    }
    const { mark, evidence } = await harness.editUntilSeen(
      host,
      (attempt) => harness.replaceText("common/marker.ts", /"[^"]*"/, `"updated-shared-marker-${attempt}"`),
      { evidence: /\[dev-plan\] generation=(\d+).*roles=.*shared.*actions=.*rebuild-client.*restart-backend/ },
    );
    const generation = evidence[1];
    await host.waitForLogSince(mark, new RegExp(`\\[backend-reload\\].*generation=${generation}`));
    // Backend-side: the restart closes the probe's socket, and a reconnect does not replay what it missed.
    await host.waitForLogSince(mark, new RegExp(`\\[SSR\\] pages-updated.*generation=${generation}`));
    await harness.waitForHttpText("updated-shared-marker");
    hmr?.close();
  });

  integrationTest("dictionary edits recycle runtime metadata and replace stale snapshots", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const initialHtml = await harness.tryWaitForHttpText("initial-shared-marker", 3_000);
    if (!initialHtml) {
      expect(host.proc.killed).toBe(false);
      hmr?.close();
      return;
    }
    const { mark } = await harness.editUntilSeen(
      host,
      (attempt) =>
        harness.writeFile(
          "lib/_fixture/fixture.dictionary.ts",
          `import { serviceDictionary } from "akanjs/dictionary";

import type { FixtureEndpoint } from "./fixture.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<FixtureEndpoint>(() => ({}))
  .translate({
    hello: ["Updated Dictionary ${attempt}", "업데이트 사전 ${attempt}"],
  });
`,
        ),
      // Each attempt recycles the builder and the backend, so patience is cheaper than a retry.
      { evidence: /\[dev-plan\].*actions=.*restart-builder/, attempts: 2, evidenceTimeoutMs: 30_000 },
    );

    await host.waitForLogSince(mark, /\[dev-host\] recycling builder\/backend for runtime metadata/);
    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/);
    await harness.waitForHttpText("initial-shared-marker");
    expect(host.proc.killed).toBe(false);
    hmr?.close();
  });

  integrationTest("config edits restart the dev host and keep serving", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const initialHtml = await harness.tryWaitForHttpText("initial-shared-marker", 3_000);
    if (!initialHtml) {
      expect(host.proc.killed).toBe(false);
      return;
    }
    const { mark } = await harness.editUntilSeen(
      host,
      (attempt) =>
        harness.writeFile(
          "akan.config.ts",
          `import type { AppConfig } from "akanjs";

// edit ${attempt}
const config: AppConfig = { externalLibs: [] };
export default config;
`,
        ),
      // Every attempt restarts the whole dev host, so wait longer before calling the event dropped.
      { evidence: /\[dev-plan\].*actions=.*restart-dev-host/, attempts: 2, evidenceTimeoutMs: 30_000 },
    );

    await host.waitForLogSince(mark, /\[dev-host\] config change detected; restarting dev host/);
    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/);
    await harness.waitForHttpText("initial-shared-marker");
    expect(host.proc.killed).toBe(false);
  });

  integrationTest("client build failure reports error and recovers after fix", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const initialHtml = await harness.tryWaitForHttpText("initial-client-marker", 3_000);
    if (!initialHtml) {
      expect(host.proc.killed).toBe(false);
      hmr?.close();
      return;
    }
    const failureHmrMark = hmr?.mark() ?? 0;

    const { mark: failureMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "ui/ClientMarker.tsx",
        `export function ClientMarker() {
  // broken ${attempt}
  return <p>broken</p>
`,
      ),
    );

    await host.waitForLogSince(
      failureMark,
      /\[build-status\].*phase=pages.*ok=false|\[build-status\].*phase=csr.*ok=false/,
    );
    if (hmr) await expectHmrMessage(hmr, failureHmrMark, isBuildStatus("error"), "the build failure");
    await harness.waitForHttpText("initial-client-marker");
    const recoveryHmrMark = hmr?.mark() ?? 0;

    // Lands right after the failed build's write burst, where Bun's watcher drops events.
    const { mark: recoveryMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "ui/ClientMarker.tsx",
        `export function ClientMarker() {
  return <p data-testid="client-marker">recovered-client-marker-${attempt}</p>;
}
`,
      ),
    );

    await host.waitForLogSince(recoveryMark, /\[build-status\].*ok=true/);
    if (hmr) await expectHmrMessage(hmr, recoveryHmrMark, isBuildStatus("ok"), "the build recovery");
    await harness.waitForHttpText("recovered-client-marker");
    hmr?.close();
  });

  integrationTest("barrel add/delete includes generated indexes in watch generation", async () => {
    const harness = await createHarness();
    const sync = new DevGeneratedIndexSync({ workspaceRoot: harness.workspaceRoot });
    // Each facet's barrel skips a file that breaks its casing convention (`common` camelCase, `ui` PascalCase).
    const facets = [
      { facet: "common", moduleName: "tmpExample", fileName: "tmpExample.ts", exportName: "commonTmpExample" },
      { facet: "ui", moduleName: "TmpExample", fileName: "TmpExample.tsx", exportName: "TmpExample" },
    ] as const;

    for (const { facet, moduleName, fileName, exportName } of facets) {
      const indexPath = `${facet}/index.ts`;
      const absChangedFile = `${harness.appDir}/${facet}/${fileName}`;
      const absIndexPath = `${harness.appDir}/${indexPath}`;

      await harness.writeFile(
        `${facet}/${fileName}`,
        `export const ${exportName} = "added-${facet}-example";
`,
      );

      const added = await sync.syncForBatch([absChangedFile]);
      expect(added.errors).toEqual([]);
      expect(added.changedFiles).toContain(absIndexPath);
      const addedIndex = await waitForFileIncludes(absIndexPath, moduleName);
      expect(addedIndex).not.toBeNull();
      expect(addedIndex ?? "").toContain(moduleName);

      await harness.removeFile(`${facet}/${fileName}`);
      const removed = await sync.syncForBatch([absChangedFile]);
      expect(removed.errors).toEqual([]);
      expect(removed.changedFiles).toContain(absIndexPath);
      const deletedIndex = await waitForFileIncludes(absIndexPath, moduleName, 1_000);
      if (deletedIndex) throw new Error(`${indexPath} still contains ${moduleName} after delete`);
      const finalIndex = await Bun.file(absIndexPath).text();
      expect(finalIndex).toBeString();
    }
  });

  integrationTest("backend boot failure stops the crash loop, surfaces build-status, and recovers on fix", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    // `akan start` regenerates server.ts from lib/, so a module-level throw here breaks every replica boot.
    const { mark: failureMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "lib/_fixture/fixture.service.ts",
        `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}

throw new Error("intentional-backend-boot-crash-${attempt}");
`,
      ),
    );

    await host.waitForLogSince(failureMark, /\[child-crash-loop\].*failed 3 consecutive boots/);
    await host.waitForLogSince(failureMark, /\[build-status\].*phase=backend.*ok=false/);
    expect(host.proc.killed).toBe(false);

    const { mark: recoveryMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "lib/_fixture/fixture.service.ts",
        `import { serve } from "akanjs/service";

// recovery ${attempt}
export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
`,
      ),
    );

    await host.waitForLogSince(recoveryMark, /backend ready pid=(\d+)|AkanApp gateway is running on port/);
    expect(host.proc.killed).toBe(false);
  });

  integrationTest("SIGKILL'd gateway leaves no orphaned replicas and the host recovers", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const port = await harness.resolvePort();

    const healthy = await waitForGatewayHealth(
      port,
      (health) =>
        typeof health.pid === "number" &&
        health.children.length > 0 &&
        health.children.every((child) => child.ready && typeof child.pid === "number"),
    );
    const gatewayPid = healthy.pid as number;
    const childPids = healthy.children.map((child) => child.pid as number);
    const mark = host.markLog();

    process.kill(gatewayPid, "SIGKILL");

    // An orphaned child would keep holding its ws port and break every later boot.
    expect(await waitForProcessesGone(childPids)).toBe(true);

    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/);
    const recovered = await waitForGatewayHealth(
      port,
      (health) => typeof health.pid === "number" && health.pid !== gatewayPid && health.children.some((c) => c.ready),
    );
    expect(recovered.pid).not.toBe(gatewayPid);
    expect(host.proc.killed).toBe(false);
  });

  integrationTest("occupied preferred ws port falls back to an ephemeral port and stays bootable", async () => {
    const harness = await createHarness();
    const port = await harness.resolvePort();
    // Child 0's deterministic ws port, held the way an orphaned replica from a killed run would hold it.
    const blocker = Bun.serve({ port: port + 10_000, fetch: () => new Response("occupied") });
    try {
      const host = await harness.startHost();
      await host.waitForLog(/falling back to an ephemeral port/);
      const health = await waitForGatewayHealth(port, (h) => h.children.some((child) => child.ready));
      expect(health.children.some((child) => child.ready)).toBe(true);
      expect(host.proc.killed).toBe(false);
    } finally {
      blocker.stop(true);
    }
  });

  integrationTest("route and css phase-5 scope remains smoke-level in this harness", async () => {
    const manualSmoke = [
      "route add/delete should be covered by a later browser-driven test",
      "css build failure should preserve active stylesheet and report build-status",
    ];

    expect(manualSmoke).toHaveLength(2);
  });
});

// Loose budgets that catch a reintroduced eager import or a per-save ratchet, not exact numbers. Absolute RSS is
// not parallel-safe: run this block alone on an idle machine (`-t "dev resource budgets"`), never loosen it.
describe("dev resource budgets", () => {
  const BOOT_MS = 150_000;
  const WAIT_MS = 90_000;
  // ~6x the measured 260-516ms per save: catches a path that got slower by a factor, not jitter.
  const SAVE_LATENCY_BUDGET_MS = 3_000;
  const budgetTest = (name: string, fn: () => Promise<void>): void => {
    if (integrationEnabled) test(name, fn, 300_000);
    else test.skip(name, fn);
  };

  budgetTest("builds the dev CSR artifact only once a request needs it, then keeps it in sync", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS });
    const port = await harness.resolvePort();

    // A full minified browser-target build of every page, only reachable via `/__csr` and `?csr=true`.
    expect(host.logs.join("")).not.toMatch(/\[csr-build\] output ->/);

    // `backend ready` fires before the gateway routes to the replica; an earlier request 503s without arming CSR.
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    const armMark = host.markLog();
    const res = await fetch(`http://127.0.0.1:${port}/?csr=true`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<html");
    expect(host.logs.join("").slice(armMark)).toMatch(/csr-build ok on demand/);

    // `editUntilSeen`: Bun always drops a save landing in the CSR build's write burst.
    const { mark: resyncMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText(
        "ui/ClientMarker.tsx",
        /(initial|csr-armed)-[\w-]*marker(-\d+)?/,
        `csr-armed-marker-${attempt}`,
      ),
    );
    // A worker logs `csr-dev generation=N patch`; the resident builder's patcher logs `csr-patch generation=N patch`.
    await host.waitForLogSince(resyncMark, /csr-rebundle ok|csr-(?:dev|patch) generation=\d+ patch/, WAIT_MS);
  });

  budgetTest("bounds the rsc worker and the tree across repeated saves", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({
      // Recycle on the second reload instead of the default tenth, with no burst-coalescing floor.
      timeoutMs: BOOT_MS,
      env: { AKAN_RSC_WORKER_MAX_RELOADS: "1", AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS: "1" },
    });
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    // The first page no longer waits for the SSR registry's boot build; the host logs when its worker is done, whether or
    // not a backend was up to take the build's announcement.
    await host.waitForLogSince(0, /\[builder\] boot builds settled/, WAIT_MS);

    const idleTotal = await DevStabilityHarness.processTreeRssBytes(host.proc.pid);
    const idleWithoutBuilder = await DevStabilityHarness.processTreeRssBytes(host.proc.pid, { excludeBuilder: true });
    const idleBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(await DevStabilityHarness.buildWorkerProcess(host.proc.pid)).toBeNull();
    console.info(
      `[budget-guard] idle tree ${Math.round(idleTotal / MB)}MB (builder ${Math.round((idleBuilder?.rssBytes ?? 0) / MB)}MB, rest ${Math.round(idleWithoutBuilder / MB)}MB)`,
    );
    // Split: the builder alone swings ~130-520MB with `Bun.build` arenas, so a tight total would flake.
    expect(idleTotal).toBeLessThan(1_200 * MB);
    // An eager import lands here, in the dev host or backend, not in the builder's arenas.
    expect(idleWithoutBuilder).toBeLessThan(600 * MB);

    const start = host.markLog();
    for (let i = 1; i <= 3; i++) {
      const { mark } = await harness.editUntilSeen(host, (attempt) =>
        harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-${i}-${attempt}`),
      );
      await host.waitForLogSince(mark, /pages-rebundle ok/, WAIT_MS);
      // CSR was never requested in this fixture, so no save may pay for a CSR rebuild.
      const afterSave = host.logs.join("").slice(mark);
      expect(afterSave).toMatch(/csr-rebundle skipped/);
      expect(afterSave).not.toMatch(/csr-rebundle ok/);
      // The backend applies the reload after the builder finishes; wait for both so each save is a whole generation.
      await host.waitForLogSince(mark, /css-rebuild checked/, WAIT_MS);
      await host.waitForLogSince(mark, /\[hmr\] backend apply/, WAIT_MS);
    }

    // Each reload re-imports the pages bundle under a fresh `?v=`, and Bun's ESM registry never evicts.
    await host.waitForLogSince(start, /rolling recycle worker reason=pages-reload-accumulation/, WAIT_MS);

    const afterWithoutBuilder = await DevStabilityHarness.processTreeRssBytes(host.proc.pid, {
      excludeBuilder: true,
    });
    expect(afterWithoutBuilder - idleWithoutBuilder).toBeLessThan(120 * MB);

    // Every per-save build runs in a worker that exits, so the builder must stay flat too.
    const afterBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(afterBuilder?.pid).toBe(idleBuilder?.pid);
    expect((afterBuilder?.rssBytes ?? 0) - (idleBuilder?.rssBytes ?? 0)).toBeLessThan(30 * MB);
    expect(await DevStabilityHarness.buildWorkerProcess(host.proc.pid)).toBeNull();
  });

  budgetTest("recycles the builder at an unmeetable ceiling and keeps developing through it", async () => {
    const harness = await createHarness();
    // Below the builder once it has served the first route build (about 380MiB), which arms the recycle.
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_BUILDER_MAX_RSS_MB: "200" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // One save arms the recycle; the old pid comes from the log, not `ps`, so it cannot race the swap.
    const { mark: firstSave } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-1-${attempt}`),
    );
    await host.waitForLogSince(firstSave, /pages-rebundle ok/, WAIT_MS);

    const recycleLog = await host.waitForLogSince(
      start,
      /recycling builder pid=(\d+) \((rss=\d+MiB>=200MiB after \d+ build\(s\))\)/,
      WAIT_MS,
    );
    await host.waitForLogSince(start, /exiting for recycle/, WAIT_MS);
    await host.waitForLogSince(start, /builder spawned pid=\d+ .*restart=1/, WAIT_MS);
    await host.waitForLogSince(start, /builder ready after restart/, WAIT_MS);
    // The backend read `base-artifact.json` once at boot, so the replacement must re-announce its boot state.
    await host.waitForLogSince(start, /announced boot state after recycle/, WAIT_MS);

    const recycled = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(recycled).not.toBeNull();
    expect(String(recycled?.pid)).not.toBe(recycleLog[1]);

    // The readiness waits above are load-bearing: a save during the recycle is seen by neither builder.
    const postRecycle = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-after-recycle-${attempt}`),
    );
    await host.waitForLogSince(postRecycle.mark, /pages-rebundle ok/, WAIT_MS);
    console.info(
      `[recycle-guard] ${recycleLog[2]}; builder ${recycleLog[1]} -> ${recycled?.pid} at ${Math.round((recycled?.rssBytes ?? 0) / MB)}MiB; post-recycle save took ${postRecycle.attempts} attempt(s)`,
    );
    await harness.waitForHttpText("marker-after-recycle", WAIT_MS);

    // A ceiling the replacement is back over within the interval is reported, and still enforced (recycles are
    // throttled), never disabled for the session. Whether it is back over depends on the machine's allocator, so the
    // warning is asserted only when it is; the decision itself is unit-tested (devHostPolicy).
    const settledFrom = host.markLog();
    for (let i = 1; i <= 3; i++) {
      const { mark } = await harness.editUntilSeen(host, (attempt) =>
        harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-settled-${i}-${attempt}`),
      );
      await host.waitForLogSince(mark, /pages-rebundle ok/, WAIT_MS).catch(() => undefined);
    }
    const settled = await DevStabilityHarness.builderProcess(host.proc.pid);
    const warned = /ceiling costs about one boot build per interval/.test(host.logs.join("").slice(start));
    //? Past the interval (a slow machine) the next report recycles instead of warning: either answer settles it.
    if ((settled?.rssBytes ?? 0) >= 200 * MB && !warned)
      await host.waitForLogSince(
        settledFrom,
        /ceiling costs about one boot build per interval|recycling builder pid=\d+|skipped: the builder fell to/,
        WAIT_MS,
      );
    expect(host.logs.join("").slice(start)).not.toMatch(/no longer enforcing it this session/);
  });

  budgetTest("serves a page requested while the builder is being replaced", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_BUILDER_MAX_RSS_MB: "200" } });
    const port = await harness.resolvePort();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    const start = host.markLog();
    // One save both evicts the route's cached client entries and arms the recycle.
    const { mark } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-through-recycle-${attempt}`),
    );
    await host.waitForLogSince(mark, /pages-rebundle ok/, WAIT_MS);

    // Timing decides whether this lands in the drain or after the exit, so assert what both must produce.
    await host.waitForLogSince(start, /recycling builder pid=\d+/, WAIT_MS);
    // Not awaited: a held request returns only once the replacement is up.
    const drainRequest = fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(WAIT_MS) }).then(
      async (response) => ({ status: response.status, html: await response.text() }),
    );

    // Anchored on the spawn: the replacement's boot build leaves a wide, known window rather than a race.
    await host.waitForLogSince(start, /exiting for recycle/, WAIT_MS);
    await host.waitForLogSince(start, /builder spawned pid=\d+ .*restart=1/, WAIT_MS);

    const holdMark = host.markLog();
    const startedAtMono = performance.now();
    // Never requested before, so no route cache can answer it; it has to reach a builder that is not there yet.
    const res = await fetch(`http://127.0.0.1:${port}/second`, { signal: AbortSignal.timeout(WAIT_MS) });
    const html = await res.text();
    const heldMs = Math.round(performance.now() - startedAtMono);

    // Without the hold this is a 500 from the dev error page, which never retries on its own.
    expect(res.status).toBe(200);
    expect(html).toContain("marker-through-recycle");
    expect(html).not.toContain("reload after the builder is ready");
    // Proves the request reached the hold, rather than arriving after the replacement was already ready.
    expect(host.logs.join("").slice(holdMark)).toMatch(/holding build-route until the builder is ready/);

    const drained = await drainRequest;
    expect(drained.status).toBe(200);
    expect(drained.html).toContain("marker-through-recycle");
    console.info(`[restart-guard] page held ${heldMs}ms across the recycle, then rendered`);
  });

  budgetTest("keeps a save's round trip inside its budget", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS });
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    const samples: number[] = [];
    for (let i = 1; i <= 3; i++) {
      let savedAtMono = 0;
      // Timed inside the mutate callback, so a retried save is measured from the attempt that landed.
      const { mark } = await harness.editUntilSeen(host, async (attempt) => {
        await harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-latency-${i}-${attempt}`);
        savedAtMono = performance.now();
      });
      // Not the refresh message: that is published only while a client is connected.
      await host.waitForLogSince(mark, /\[hmr\] backend apply/, WAIT_MS);
      samples.push(performance.now() - savedAtMono);
    }

    const rounded = samples.map((ms) => Math.round(ms));
    console.info(`[latency-guard] save -> new code live ${rounded.join("ms, ")}ms`);
    // The worst save, not a median, which would hide a first save that pays for something the rest do not.
    expect(Math.max(...rounded)).toBeLessThan(SAVE_LATENCY_BUDGET_MS);
  });

  budgetTest("suspends the builder when the dev server goes idle and wakes it on the next edit", async () => {
    const harness = await createHarness();
    // 3s stands in for the 5min default so the dev server reaches idle inside a test.
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_DEV_IDLE_SUSPEND_MS: "3000" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // Never fires if anything periodic (timed metrics, a watched-file write) keeps the dev server busy.
    await host.waitForLogSince(start, /\[idle-suspend\] no build activity for \d+s; released the builder/, WAIT_MS);
    const suspendedBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(suspendedBuilder).toBeNull();
    // Only build capacity suspends — the backend keeps serving the preview URL.
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // A fresh watcher over a tree the suspend just churned: squarely inside Bun's drop window.
    const { mark } = await harness.editUntilSeen(
      host,
      (attempt) => harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-after-wake-${attempt}`),
      { evidence: /\[idle-suspend\] waking/ },
    );
    const awake = await host.waitForLogSince(mark, /\[idle-suspend\] awake in (\d+)ms/, WAIT_MS);
    // The woken builder rebuilds from disk, so the edit that woke it is in the artifact it announces.
    await host.waitForLogSince(mark, /announced boot state after recycle/, WAIT_MS);
    const wokenBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(wokenBuilder).not.toBeNull();
    expect(wokenBuilder?.pid).not.toBe(suspendedBuilder?.pid);
    await harness.waitForHttpText("marker-after-wake", WAIT_MS);
    console.info(`[idle-suspend-guard] woke in ${awake[1]}ms; builder back at pid=${wokenBuilder?.pid}`);

    const postWake = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-postwake-${attempt}`),
    );
    await host.waitForLogSince(postWake.mark, /pages-rebundle ok/, WAIT_MS);
    console.info(`[idle-suspend-guard] post-wake save took ${postWake.attempts} attempt(s)`);
    await harness.waitForHttpText("marker-postwake", WAIT_MS);
  });

  budgetTest("holds a request that needs a build until the wake finishes, instead of failing it", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_DEV_IDLE_SUSPEND_MS: "3000" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    await host.waitForLogSince(start, /\[idle-suspend\] .*released the builder/, WAIT_MS);
    expect(await DevStabilityHarness.builderProcess(host.proc.pid)).toBeNull();

    // A request only the builder can serve also wakes it, and must not be answered "builder is stopped".
    const mark = host.markLog();
    const port = await harness.resolvePort();
    const status = await fetch(`http://127.0.0.1:${port}/__csr`)
      .then((res) => res.status)
      .catch(() => 0);

    await host.waitForLogSince(mark, /\[idle-suspend\] waking \(build-csr arrived while suspended\)/, WAIT_MS);
    // `[builder]`: the same queue holds requests across a restart too; the wake line above tells them apart.
    await host.waitForLogSince(mark, /\[builder\] replaying 1 request\(s\) held while the builder was away/, WAIT_MS);
    expect(status).toBe(200);
    expect(await DevStabilityHarness.builderProcess(host.proc.pid)).not.toBeNull();
  });

  // Nothing watches between the suspend stopping its watcher and the replacement priming its index from disk.
  budgetTest("restarts the backend for a save that lands while the builder is away", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_DEV_IDLE_SUSPEND_MS: "3000" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    await host.waitForLogSince(start, /\[idle-suspend\] .*released the builder/, WAIT_MS);

    const mark = host.markLog();
    const port = await harness.resolvePort();
    // The clock: in flight until the replacement is ready; its status is moot once the backend restarts.
    const request = fetch(`http://127.0.0.1:${port}/__csr`).catch(() => null);
    // Not `srvkit/backendMarker.ts`: the regenerated `server.ts` orphans it, so it restarts by path role only.
    await harness.writeFile(
      "lib/_fixture/fixture.service.ts",
      `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
// touched while the builder was away
`,
    );
    await request;

    await host.waitForLogSince(mark, /\[builder-gap\] 1 backend file\(s\) changed while the builder was away/, WAIT_MS);
    await host.waitForLogSince(mark, /\[backend-reload\]/, WAIT_MS);
    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/, WAIT_MS);
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
  });
});
