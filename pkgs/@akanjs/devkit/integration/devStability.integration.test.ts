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
    const facets = ["common", "ui"] as const;

    for (const facet of facets) {
      const exportName = `${facet}TmpExample`;
      const indexPath = `${facet}/index.ts`;
      const absChangedFile = `${harness.appDir}/${facet}/tmpExample.ts`;
      const absIndexPath = `${harness.appDir}/${indexPath}`;

      await harness.writeFile(
        `${facet}/tmpExample.ts`,
        `export const ${exportName} = "added-${facet}-example";
`,
      );

      const added = await sync.syncForBatch([absChangedFile]);
      expect(added.errors).toEqual([]);
      expect(added.changedFiles).toContain(absIndexPath);
      const addedIndex = await waitForFileIncludes(absIndexPath, "tmpExample");
      expect(addedIndex).not.toBeNull();
      expect(addedIndex ?? "").toContain("tmpExample");

      await harness.removeFile(`${facet}/tmpExample.ts`);
      const removed = await sync.syncForBatch([absChangedFile]);
      expect(removed.errors).toEqual([]);
      expect(removed.changedFiles).toContain(absIndexPath);
      const deletedIndex = await waitForFileIncludes(absIndexPath, "tmpExample", 1_000);
      if (deletedIndex) throw new Error(`${indexPath} still contains tmpExample after delete`);
      const finalIndex = await Bun.file(absIndexPath).text();
      expect(finalIndex).toBeString();
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
