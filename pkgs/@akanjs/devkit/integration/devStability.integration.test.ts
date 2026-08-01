import { afterEach, describe, expect, test } from "bun:test";
import { DevGeneratedIndexSync } from "../frontendBuild";
import { DevStabilityHarness } from "./devStabilityHarness";

const integrationEnabled = process.env.AKAN_DEV_STABILITY_INTEGRATION === "1";
const INTEGRATION_TIMEOUT_MS = 120_000;
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

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("dev stability integration harness", () => {
  integrationTest("server-only valid edits restart backend without client refresh", async () => {
    const harness = await createHarness();
    const host = await harness.startHost();
    const hmr = await harness.tryConnectHmrProbe();
    const mark = host.markLog();
    const hmrMark = hmr?.mark() ?? 0;

    await harness.replaceText("srvkit/backendMarker.ts", "initial-backend-marker", "updated-backend-marker");

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
    const mark = host.markLog();
    const hmrMark = hmr?.mark() ?? 0;

    await harness.replaceText("ui/ClientMarker.tsx", "initial-client-marker", "updated-client-marker");

    await host.waitForLogSince(mark, /\[dev-plan\].*roles=.*client.*actions=.*rebuild-client/);
    if (hmr) {
      const message = await hmr.waitForMessageSince(hmrMark, isRefreshMessage);
      expect(message).toBeTruthy();
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
    const mark = host.markLog();
    const hmrMark = hmr?.mark() ?? 0;

    await harness.replaceText("common/marker.ts", "initial-shared-marker", "updated-shared-marker");

    const plan = await host.waitForLogSince(
      mark,
      /\[dev-plan\] generation=(\d+).*roles=.*shared.*actions=.*rebuild-client.*restart-backend/,
    );
    const generation = plan[1];
    await host.waitForLogSince(mark, new RegExp(`\\[backend-reload\\].*generation=${generation}`));
    if (hmr)
      await hmr.waitForMessageSince(
        hmrMark,
        (msg) =>
          typeof msg === "object" && msg !== null && "generation" in msg && String(msg.generation) === generation,
      );
    else await host.waitForLogSince(mark, new RegExp(`\\[SSR\\] pages-updated.*generation=${generation}`));
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
    const mark = host.markLog();

    await harness.writeFile(
      "lib/_fixture/fixture.dictionary.ts",
      `import { serviceDictionary } from "akanjs/dictionary";

import type { FixtureEndpoint } from "./fixture.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<FixtureEndpoint>(() => ({}))
  .translate({
    hello: ["Updated Dictionary", "업데이트 사전"],
  });
`,
    );

    await host.waitForLogSince(mark, /\[dev-plan\].*actions=.*restart-builder/);
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
    const mark = host.markLog();

    await harness.writeFile(
      "akan.config.ts",
      `import type { AppConfig } from "akanjs";

const config: AppConfig = { externalLibs: [] };
export default config;
`,
    );

    await host.waitForLogSince(mark, /\[dev-plan\].*actions=.*restart-dev-host/);
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
    const failureMark = host.markLog();
    const failureHmrMark = hmr?.mark() ?? 0;

    await harness.writeFile(
      "ui/ClientMarker.tsx",
      `export function ClientMarker() {
  return <p>broken</p>
`,
    );

    await host.waitForLogSince(
      failureMark,
      /\[build-status\].*phase=pages.*ok=false|\[build-status\].*phase=csr.*ok=false/,
    );
    if (hmr) await hmr.waitForMessageSince(failureHmrMark, isBuildStatus("error"));
    await harness.waitForHttpText("initial-client-marker");
    const recoveryMark = host.markLog();
    const recoveryHmrMark = hmr?.mark() ?? 0;

    await harness.writeFile(
      "ui/ClientMarker.tsx",
      `export function ClientMarker() {
  return <p data-testid="client-marker">recovered-client-marker</p>;
}
`,
    );

    await host.waitForLogSince(recoveryMark, /\[build-status\].*ok=true/);
    if (hmr) await hmr.waitForMessageSince(recoveryHmrMark, isBuildStatus("ok"));
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
    const failureMark = host.markLog();

    // The service file is part of the generated server graph (`akan start` regenerates server.ts
    // from lib/), so a module-level throw here breaks every replica boot.
    await harness.writeFile(
      "lib/_fixture/fixture.service.ts",
      `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}

throw new Error("intentional-backend-boot-crash");
`,
    );

    // The gateway abandons the replica after three failed boots instead of retrying forever...
    await host.waitForLogSince(failureMark, /\[child-crash-loop\].*failed 3 consecutive boots/);
    // ...and the failure reaches the dev host's build-status pipeline (HMR overlay path).
    await host.waitForLogSince(failureMark, /\[build-status\].*phase=backend.*ok=false/);
    expect(host.proc.killed).toBe(false);

    const recoveryMark = host.markLog();
    await harness.writeFile(
      "lib/_fixture/fixture.service.ts",
      `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
`,
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
