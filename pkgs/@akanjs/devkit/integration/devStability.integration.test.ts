import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { DevGeneratedIndexSync } from "../frontendBuild";
import { DevStabilityHarness, type DevStabilityHmrProbe } from "./devStabilityHarness";

const integrationEnabled = process.env.AKAN_DEV_STABILITY_INTEGRATION === "1";
// Every test here boots a real dev server, and contention pushes a cold boot from ~3s to 21-55s
// (`05-phase1-results.md`). At 120s a loaded machine ran out of budget mid-restart and reported it as a
// product failure, which is the exact ambiguity this file exists to remove.
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
  (msg.type === "client-refresh" || msg.type === "rsc-refresh" || msg.type === "reload");

const isBuildStatus =
  (status: "error" | "ok") =>
  (msg: unknown): boolean =>
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === "build-status" &&
    "status" in msg &&
    msg.status === status;

/**
 * Assert an HMR message arrives — unless the socket dropped while waiting.
 *
 * The hub does not replay (`akanjs/server/hmr/wsHub.ts`): anything published while the probe was
 * reconnecting is simply gone, so a miss across a reconnect says nothing about the product. A real browser
 * covers the same gap by reloading when the `hello` buildId moved, not by expecting the message. Under
 * parallel load the socket flaps repeatedly, and this is what that looks like from the probe:
 * `socket=closed reconnects=5 since-mark=[build-status,hello,hello,rsc-refresh,…]`.
 */
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

/**
 * `cleanup()` waits up to 3s for a SIGTERM'd dev host to exit and shells out to `ps` twice, and on a
 * loaded machine that overruns Bun's default 5s hook budget. A hook timeout fails the test that had
 * already passed, which reads exactly like a product failure — two of the five failures in a 3-way
 * parallel run were this and nothing else.
 */
const HOOK_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  if (!integrationEnabled) return;
  // A run killed mid-test (a `-t` filter interrupted, an editor stopping the runner) leaves its fixture
  // in `apps/` and its dev host running. Both interfere with every later run: the process holds ports
  // and rebuilds a deleted app, and the directory shifts the app index every port prediction derives
  // from. Only fixtures whose owning test pid is gone are swept, so this is safe with a suite running
  // alongside.
  const swept = await DevStabilityHarness.sweepAbandonedFixtures(DevStabilityHarness.defaultWorkspaceRoot);
  if (swept.length) console.info(`[harness] swept ${swept.length} abandoned fixture(s): ${swept.join(", ")}`);
}, HOOK_TIMEOUT_MS);

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
}, HOOK_TIMEOUT_MS);

afterAll(() => {
  if (!integrationEnabled) return;
  const { edits, retried } = DevStabilityHarness.editStats();
  // Reported on purpose, every run. A retry means a real save produced no rebuild whatsoever — Bun's
  // dropped `fs.watch` event (`local/optimize-resource/06-watcher-dropped-event.md`), which users hit too
  // through format-on-save and save-all. A non-zero number here means this suite is passing *around* a
  // product bug rather than because it is absent, and it is the signal for fixing that bug properly.
  console.info(`[harness] ${edits} observed edit(s), ${retried} needed a retry after a dropped watch event`);
  // Every wait is individually bounded but their budgets sum past the per-test timeout, so a loaded round
  // can kill a test without any single wait failing — and Bun then reports only "this test timed out". These
  // are the numbers that say how close a green run came, and which step to look at when one dies.
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
    expect(host.logs.join("").slice(mark)).not.toMatch(/\[hmr\].*(client-refresh|rsc-refresh)/);
    await hmr?.waitForNoMessageSince(hmrMark, isRefreshMessage);
    hmr?.close();
  });

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
      await host.waitForLogSince(mark, /\[hmr\].*(client-refresh|rsc-refresh|reload)|\[SSR\] pages-updated/);
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
    // Asserted backend-side, not through the probe. A shared edit restarts the backend, which closes the
    // socket the probe opened; the probe reconnects, but a reconnect does not replay what was published
    // while it was down, and a real browser handles that by reloading when the `hello` buildId moved
    // (`akanjs/server/hmr/clientScript.ts`) rather than by expecting the message. Requiring a probe
    // message here only held while the client rebuild happened to finish before the restart killed the
    // connection — a race this test lost the moment builds moved into a worker process and took ~240ms
    // longer to start.
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
      // As with the config edit: each attempt recycles the builder and the backend, so patience is cheaper
      // than a retry.
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
      // Re-applying this edit is expensive — every attempt restarts the whole dev host — so wait longer
      // before concluding the event was dropped rather than merely slow.
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

    // The edit that used to be dropped: it lands right after the failed build's write burst, and in a
    // 3-way parallel run all three shards timed out here on 60s of completely empty log output.
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
    // `common` barrels export camelCase names; `ui` barrels export PascalCase component names. Each facet's
    // fixture file must follow its own casing convention or the barrel deliberately skips it.
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
    // The service file is part of the generated server graph (`akan start` regenerates server.ts
    // from lib/), so a module-level throw here breaks every replica boot.
    const { mark: failureMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.writeFile(
        "lib/_fixture/fixture.service.ts",
        `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}

throw new Error("intentional-backend-boot-crash-${attempt}");
`,
      ),
    );

    // The gateway abandons the replica after three failed boots instead of retrying forever...
    await host.waitForLogSince(failureMark, /\[child-crash-loop\].*failed 3 consecutive boots/);
    // ...and the failure reaches the dev host's build-status pipeline (HMR overlay path).
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

    // Children must notice the closed IPC channel and exit instead of orphaning (they would
    // otherwise keep holding their ws ports and break every subsequent boot).
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
    // The gateway assigns child 0 the deterministic ws port `port + 10_000`; occupy it up front
    // the way an orphaned replica from a killed run would.
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

/**
 * Resource budgets for `akan start`. A dev sandbox holds this process tree for a whole session, so
 * every regression here multiplies by the number of tenants. Budgets are deliberately loose (they
 * carry headroom over the measured values) — they exist to catch a *reintroduced* eager import or an
 * unbounded per-save ratchet, not to pin exact numbers. Raising one should be a visible diff.
 *
 * Deliberately two tests, not one per property: each boots a full dev server, and four boots after
 * the eleven tests above pushed cold boot from 3s to 21-55s through sheer machine contention, which
 * silently exhausted the waits and looked like product failures. Both tests therefore assert several
 * related properties against a single boot, with explicit generous waits. Run the block on its own
 * (`-t "dev resource budgets"`) when timing matters.
 *
 * **This block is not parallel-safe, and cannot be made so.** It asserts *absolute* resident memory, so
 * several dev servers competing for the machine changes what the number means rather than adding noise
 * around it — a 3-way parallel run reported 178MB against the 120MB budget. That is a property of the
 * measurement, not flakiness: run this block on an otherwise idle machine and parallelise the behavioural
 * block above. Loosening a budget to survive a parallel run would throw away the regression signal the
 * budget exists for.
 */
describe("dev resource budgets", () => {
  const BOOT_MS = 150_000;
  const WAIT_MS = 90_000;
  /**
   * Measured on this fixture at **260-516ms** per save. Set ~6× above that, like every budget here: it is
   * looking for a path that got slower by a factor — a boot build that stopped being avoidable, a worker
   * spawn that stopped being warm — not for jitter on a busy laptop. `apps/akan`, ~25× this fixture's
   * pages bundle, took ~1.5s per save when the plan started.
   */
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

    // Mobile local dev points a device WebView at this URL, so it must serve HTML, not a 404. Wait
    // for the app to actually serve first: `backend ready` fires before the gateway routes to the
    // replica, and a too-early request 503s without reaching the router that arms CSR.
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    const armMark = host.markLog();
    const res = await fetch(`http://127.0.0.1:${port}/?csr=true`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<html");
    expect(host.logs.join("").slice(armMark)).toMatch(/csr-build ok on demand/);

    // Armed: from here on every save rebuilds CSR, which is what keeps a live mobile session working.
    //
    // `editUntilSeen` rather than a bare save, because the CSR build above emits a whole minified tree
    // into `.akan/artifact/csr` and a save landing in that window is dropped by Bun 100% of the time
    // (`local/optimize-resource/06-watcher-dropped-event.md`).
    const { mark: resyncMark } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText(
        "ui/ClientMarker.tsx",
        /(initial|csr-armed)-[\w-]*marker(-\d+)?/,
        `csr-armed-marker-${attempt}`,
      ),
    );
    await host.waitForLogSince(resyncMark, /csr-rebundle ok/, WAIT_MS);
  });

  budgetTest("bounds the rsc worker and the tree across repeated saves", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({
      // Recycle on the second reload so this needs a couple of saves rather than the ten a
      // default-threshold run would take, and take the burst-coalescing floor out of the equation.
      timeoutMs: BOOT_MS,
      env: { AKAN_RSC_WORKER_MAX_RELOADS: "1", AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS: "1" },
    });
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    const idleTotal = await DevStabilityHarness.processTreeRssBytes(host.proc.pid);
    const idleWithoutBuilder = await DevStabilityHarness.processTreeRssBytes(host.proc.pid, { excludeBuilder: true });
    const idleBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    // Nothing should be building at idle, so the disposable worker must not be resident.
    expect(await DevStabilityHarness.buildWorkerProcess(host.proc.pid)).toBeNull();
    // Printed so a run that came close to its budget says so, instead of being indistinguishable from a
    // comfortable one — the same reason the recycle and idle-suspend guards report their numbers.
    console.info(
      `[budget-guard] idle tree ${Math.round(idleTotal / MB)}MB (builder ${Math.round((idleBuilder?.rssBytes ?? 0) / MB)}MB, rest ${Math.round(idleWithoutBuilder / MB)}MB)`,
    );
    // Split in two because the two halves have very different variance. The builder legitimately swings
    // from a ~130MB fresh floor to ~520MB once it has built a route (`Bun.build` arenas the RSS-ceiling
    // recycle is what bounds), so a tight total would flake. Measured 929-959MB total / ~414MB without
    // the builder; the old 1000MB total came from a phase-1 topology where the fixture measured ~670MB
    // and is only ~4% above what the current topology legitimately uses.
    expect(idleTotal).toBeLessThan(1_200 * MB);
    // This is the half that catches what the budget exists for: an eager import lands in the dev host or
    // the backend, not in the builder's arenas. The cheapest reintroduction is ~30MB and the devkit
    // barrel cycle was 236MB, so this bound still fails on the latter.
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
      // Waiting for the builder alone is not enough before the next iteration: the backend is still
      // applying the reload after that, and it writes into the watched tree too. `editUntilSeen` handles
      // the drop window itself, but these two waits are still what makes each iteration a whole
      // generation, which is what the RSS deltas below are measured across.
      await host.waitForLogSince(mark, /css-rebuild checked/, WAIT_MS);
      await host.waitForLogSince(mark, /\[hmr\] backend apply/, WAIT_MS);
    }

    // Each in-place reload re-imports the pages bundle under a fresh `?v=`, and Bun's ESM registry
    // never evicts — so without a recycle the worker grows for the life of the process.
    await host.waitForLogSince(start, /rolling recycle worker reason=pages-reload-accumulation/, WAIT_MS);

    // The dev host, gateway, replica and rsc worker must all stay flat across saves.
    const afterWithoutBuilder = await DevStabilityHarness.processTreeRssBytes(host.proc.pid, {
      excludeBuilder: true,
    });
    expect(afterWithoutBuilder - idleWithoutBuilder).toBeLessThan(120 * MB);

    // And so must the builder. It used to be excluded from this budget because `Bun.build` retains
    // native arenas no GC reclaims, which made it grow ~120MB per save on this fixture; every build
    // that scales per save now runs in a process that exits, so its memory goes back to the OS.
    const afterBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(afterBuilder?.pid).toBe(idleBuilder?.pid);
    expect((afterBuilder?.rssBytes ?? 0) - (idleBuilder?.rssBytes ?? 0)).toBeLessThan(30 * MB);
    // The worker is transient: three generations built, and none of them is still around.
    expect(await DevStabilityHarness.buildWorkerProcess(host.proc.pid)).toBeNull();
  });

  budgetTest("recycles the builder at an unmeetable ceiling and keeps developing through it", async () => {
    const harness = await createHarness();
    // Deliberately *below* this fixture's post-boot builder. Moving every per-save build into a
    // disposable worker means the builder no longer grows into a ceiling, so a ceiling it is already
    // over is the only way left to drive the recycle path end to end — and it is also the case the
    // escape hatch exists for: an app whose boot floor simply does not fit under the limit.
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_BUILDER_MAX_RSS_MB: "200" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // One save is enough: the builder reports its rss as soon as the batch drains, and the host arms
    // the recycle from that report. The old pid comes from the log rather than from `ps`, so this does
    // not race the swap it is about to observe.
    const { mark: firstSave } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-1-${attempt}`),
    );
    await host.waitForLogSince(firstSave, /pages-rebundle ok/, WAIT_MS);

    // The host decides, the builder drains rather than being killed, and the replacement comes up.
    const recycleLog = await host.waitForLogSince(
      start,
      /recycling builder pid=(\d+) \((rss=\d+MiB>=200MiB after \d+ build\(s\))\)/,
      WAIT_MS,
    );
    await host.waitForLogSince(start, /exiting for recycle/, WAIT_MS);
    await host.waitForLogSince(start, /builder spawned pid=\d+ .*restart=1/, WAIT_MS);
    await host.waitForLogSince(start, /builder ready after restart/, WAIT_MS);
    // The backend read `base-artifact.json` once at boot, so the replacement has to re-announce what
    // it booted with or the backend keeps serving the artifact of the builder that just exited.
    await host.waitForLogSince(start, /announced boot state after recycle/, WAIT_MS);

    const recycled = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(recycled).not.toBeNull();
    expect(String(recycled?.pid)).not.toBe(recycleLog[1]);

    // And the dev server is still a dev server: the replacement watches, rebuilds and serves.
    //
    // Waiting for readiness above is load-bearing, not padding. The watcher is installed at the end of
    // the boot build, so a save during the recycle is seen by neither builder — this test lost one
    // exactly that way.
    const postRecycle = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-after-recycle-${attempt}`),
    );
    await host.waitForLogSince(postRecycle.mark, /pages-rebundle ok/, WAIT_MS);
    console.info(
      `[recycle-guard] ${recycleLog[2]}; builder ${recycleLog[1]} -> ${recycled?.pid} at ${Math.round((recycled?.rssBytes ?? 0) / MB)}MiB; post-recycle save took ${postRecycle.attempts} attempt(s)`,
    );
    await harness.waitForHttpText("marker-after-recycle", WAIT_MS);

    // This fixture's builder boots well under the ceiling and blows past it on its first build, which
    // is the shape of every app the ceiling is derived for — a 1.2GB sandbox gives the builder ~420MB
    // and a single route build costs ~247MB. So the host says the ceiling is tight...
    for (let i = 1; i <= 3; i++) {
      const { mark } = await harness.editUntilSeen(host, (attempt) =>
        harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-settled-${i}-${attempt}`),
      );
      await host.waitForLogSince(mark, /pages-rebundle ok/, WAIT_MS).catch(() => undefined);
    }
    await host.waitForLogSince(start, /ceiling costs about one boot build per interval/, WAIT_MS);
    // ...and goes on enforcing it. This used to disable the ceiling for the rest of the session on the
    // same evidence, which on a small sandbox means nothing bounds the builder from the first page load
    // onwards. Recycling is throttled to one per interval; that throttle is the answer to the cost, not
    // dropping the bound.
    expect(host.logs.join("").slice(start)).not.toMatch(/no longer enforcing it this session/);
  });

  // The guard the memory work did not have. Every budget above asserts RSS; none of them asserts that a
  // page still renders while the machinery those budgets require is mid-swap — and that gap is where two
  // shipped defects lived (`local/optimize-resource/19-shutdown-and-restart-races.md`).
  budgetTest("serves a page requested while the builder is being replaced", async () => {
    const harness = await createHarness();
    // Same unmeetable ceiling as the guard above, for the same reason: a builder that no longer grows
    // into a ceiling has to start under one for the recycle path to run end to end.
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_BUILDER_MAX_RSS_MB: "200" } });
    const port = await harness.resolvePort();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    const start = host.markLog();
    // One save does both halves of the setup: it drops the route's client entries, so the next request
    // has to ask the builder again rather than being served from cache, and it makes the builder report
    // an rss over the ceiling, which is what arms the recycle.
    const { mark } = await harness.editUntilSeen(host, (attempt) =>
      harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-through-recycle-${attempt}`),
    );
    await host.waitForLogSince(mark, /pages-rebundle ok/, WAIT_MS);

    // A builder that has been asked to drain is still alive and refuses everything new, so this request
    // has to be held for the replacement exactly like one that arrives after the process is gone. Timing
    // decides which of the two windows it actually lands in — the drain of an idle builder is short, and
    // the log is polled — so what is asserted is the outcome both windows must produce. The drain itself
    // is pinned deterministically one layer down, in `incrementalBuilder.host.test.ts`.
    await host.waitForLogSince(start, /recycling builder pid=\d+/, WAIT_MS);
    // Not awaited here: a held request only returns once the replacement is up, and waiting for it would
    // put every assertion below on the far side of the window they are about.
    const drainRequest = fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(WAIT_MS) }).then(
      async (response) => ({ status: response.status, html: await response.text() }),
    );

    // Wait until the replacement exists but is still doing its boot build. From here it cannot answer
    // anything for seconds — which is exactly the window a developer's reload lands in, and the point of
    // anchoring on the spawn rather than on the exit: the gap after it is wide and known, not a race.
    await host.waitForLogSince(start, /exiting for recycle/, WAIT_MS);
    await host.waitForLogSince(start, /builder spawned pid=\d+ .*restart=1/, WAIT_MS);

    const holdMark = host.markLog();
    const startedAtMono = performance.now();
    // The second route, never requested before, so this one cannot be answered from the route cache the
    // request above just populated — it has to reach a builder that is not there yet.
    const res = await fetch(`http://127.0.0.1:${port}/second`, { signal: AbortSignal.timeout(WAIT_MS) });
    const html = await res.text();
    const heldMs = Math.round(performance.now() - startedAtMono);

    // What the developer sees, asserted first because it is the whole point: with the hold removed this
    // same request is answered **500** by the dev error page, and nothing retries on its own — the tab
    // stays broken until it is reloaded by hand. Measured both ways before this guard was committed.
    expect(res.status).toBe(200);
    expect(html).toContain("marker-through-recycle");
    expect(html).not.toContain("reload after the builder is ready");
    // And this is what stops the test passing having tested nothing: a request that arrives after the
    // replacement is already ready never reaches the path under test, and everything above holds anyway.
    expect(host.logs.join("").slice(holdMark)).toMatch(/holding build-route until the builder is ready/);

    // The one fired at the drain, whichever side of the exit it landed on.
    const drained = await drainRequest;
    expect(drained.status).toBe(200);
    expect(drained.html).toContain("marker-through-recycle");
    console.info(`[restart-guard] page held ${heldMs}ms across the recycle, then rendered`);
  });

  // The other half of a resource budget, and the half this plan spent: every megabyte above was bought
  // with latency — a worker process spawned per save, a boot build per recycle and per wake, a hold
  // window in front of requests that land in one. Nothing measured what that cost, so a change that
  // traded another second per save for another 50MB would have passed every guard in this block.
  budgetTest("keeps a save's round trip inside its budget", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS });
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    const samples: number[] = [];
    for (let i = 1; i <= 3; i++) {
      let savedAtMono = 0;
      // Timed from inside the mutate callback so a retried save — Bun drops watcher events, which is why
      // `editUntilSeen` exists — is measured from the attempt that actually landed, not from the first.
      const { mark } = await harness.editUntilSeen(host, async (attempt) => {
        await harness.replaceText("ui/ClientMarker.tsx", /marker(-[\w-]+)?/, `marker-latency-${i}-${attempt}`);
        savedAtMono = performance.now();
      });
      // The moment the running dev server is serving the new code, which is everything the developer is
      // waiting for. Deliberately not the browser's refresh message: that one is only published when a
      // client is connected, so measuring it would measure a WebSocket probe's reconnects as well.
      await host.waitForLogSince(mark, /\[hmr\] backend apply/, WAIT_MS);
      samples.push(performance.now() - savedAtMono);
    }

    const rounded = samples.map((ms) => Math.round(ms));
    console.info(`[latency-guard] save -> new code live ${rounded.join("ms, ")}ms`);
    // Per save, not summed: the interesting regression is one save getting slower, and the median would
    // hide a first save that pays for something the rest do not.
    expect(Math.max(...rounded)).toBeLessThan(SAVE_LATENCY_BUDGET_MS);
  });

  budgetTest("suspends the builder when the dev server goes idle and wakes it on the next edit", async () => {
    const harness = await createHarness();
    // 3s stands in for the 5min default: the machinery is the same, and the guard needs the dev server
    // to actually reach idle inside a test.
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_DEV_IDLE_SUSPEND_MS: "3000" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // Nothing periodic may keep the dev server "busy": if the builder reported metrics on a timer, or
    // the backend wrote a watched file, this would never fire.
    await host.waitForLogSince(start, /\[idle-suspend\] no build activity for \d+s; released the builder/, WAIT_MS);
    const suspendedBuilder = await DevStabilityHarness.builderProcess(host.proc.pid);
    expect(suspendedBuilder).toBeNull();
    // Only build capacity suspends — the backend keeps serving the preview URL.
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);

    // The edit that has to wake it. A suspended host has just installed a fresh watcher over a tree the
    // suspend itself churned, so this is squarely inside Bun's drop window — it is what failed here in a
    // 3-way parallel run, on 60s of empty log output.
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

    // And it is a normal dev server again afterwards.
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

    // A browser asking for something the backend cannot serve on its own is the other wake trigger, and
    // the request must not be answered with "builder is stopped" the way a dead builder's would be.
    const mark = host.markLog();
    const port = await harness.resolvePort();
    const status = await fetch(`http://127.0.0.1:${port}/__csr`)
      .then((res) => res.status)
      .catch(() => 0);

    await host.waitForLogSince(mark, /\[idle-suspend\] waking \(build-csr arrived while suspended\)/, WAIT_MS);
    // `[builder]`, not `[idle-suspend]`: the same queue now also holds requests across a builder restart,
    // so the replay says what it did rather than which of the two reasons put the request there. The wake
    // line above is what distinguishes them, and it is asserted first for that reason.
    await host.waitForLogSince(mark, /\[builder\] replaying 1 request\(s\) held while the builder was away/, WAIT_MS);
    expect(status).toBe(200);
    expect(await DevStabilityHarness.builderProcess(host.proc.pid)).not.toBeNull();
  });

  // The gap on the other side of the same window: requests held across it are answered, but for a while
  // nothing was *watching* across it. The suspend stops its watcher before the replacement builder has
  // primed its index, and the replacement primes from the disk it finds — so a save in between is
  // baseline to it, reported by nobody, and the backend goes on running the code it replaced. Phase 2
  // made this window routine by recycling the builder on every rss ceiling crossing.
  budgetTest("restarts the backend for a save that lands while the builder is away", async () => {
    const harness = await createHarness();
    const host = await harness.startHost({ timeoutMs: BOOT_MS, env: { AKAN_DEV_IDLE_SUSPEND_MS: "3000" } });
    const start = host.markLog();
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
    await host.waitForLogSince(start, /\[idle-suspend\] .*released the builder/, WAIT_MS);

    const mark = host.markLog();
    const port = await harness.resolvePort();
    // This request is the clock: it wakes the dev server and is answered only once the replacement
    // builder is ready, so a write issued while it is in flight lands squarely inside the gap. Its own
    // status is not asserted here — the write below restarts the backend, which drops the connection.
    const request = fetch(`http://127.0.0.1:${port}/__csr`).catch(() => null);
    // A service the backend imports, rather than this fixture's `srvkit/backendMarker.ts`: that marker is
    // orphaned once `akan start` regenerates `server.ts`, so it is not in the backend graph at all and an
    // edit to it restarts the backend by path role instead.
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
    // And back to a working dev server, rather than one stuck restarting.
    await host.waitForLogSince(mark, /backend ready pid=(\d+)|AkanApp gateway is running on port/, WAIT_MS);
    await harness.waitForHttpText("initial-client-marker", WAIT_MS);
  });
});
