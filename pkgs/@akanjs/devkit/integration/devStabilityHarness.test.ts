import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { DevStabilityHarness } from "./devStabilityHarness.fixture";

const servers: Bun.Server<undefined>[] = [];
const makeRoot = tempDirs("akan-harness-port-");

const createRoot = async (): Promise<string> => {
  const root = await makeRoot();
  await mkdir(path.join(root, "apps"), { recursive: true });
  return root;
};

const occupy = (port: number): Bun.Server<undefined> => {
  const server = Bun.serve({ port, fetch: () => new Response("occupied") });
  servers.push(server);
  return server;
};

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

describe("dev stability harness port allocation", () => {
  test("hands every harness in a process a distinct port", async () => {
    const workspaceRoot = await createRoot();
    const ports: number[] = [];
    for (let i = 0; i < 12; i++) ports.push(await new DevStabilityHarness({ workspaceRoot }).resolvePort());

    expect(new Set(ports).size).toBe(ports.length);
    // The cursor wraps at the end of the band, so forward is measured around it; a step back reads as most of a lap.
    const band = DevStabilityHarness.portOffsetMax - DevStabilityHarness.portOffsetMin;
    const steps = ports.slice(1).map((port, idx) => (port - ports[idx] + band) % band);
    expect(steps.every((step) => step > 0 && step % DevStabilityHarness.portOffsetStride === 0)).toBe(true);
    expect(steps.reduce((sum, step) => sum + step, 0)).toBeLessThan(band);
  });

  test("returns the same port on every call instead of re-deriving it", async () => {
    const workspaceRoot = await createRoot();
    const harness = new DevStabilityHarness({ workspaceRoot });
    const first = await harness.resolvePort();

    // A rival fixture shifts this app's index among the locale-sorted apps.
    await mkdir(path.join(workspaceRoot, "apps", "aaa-rival"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "apps", "aaa-rival", "akan.config.ts"), "export default {};\n");

    expect(await harness.resolvePort()).toBe(first);
  });

  test("skips a candidate port that something else already holds", async () => {
    const workspaceRoot = await createRoot();
    const taken =
      (await new DevStabilityHarness({ workspaceRoot }).resolvePort()) + DevStabilityHarness.portOffsetStride;
    occupy(taken);

    const next = await new DevStabilityHarness({ workspaceRoot }).resolvePort();

    // The next cursor step lands exactly on the occupied port.
    expect(next).not.toBe(taken);
    expect(await DevStabilityHarness.isPortFree(next)).toBe(true);
  });

  test("honours an explicit offset so a probe script can pin its port", async () => {
    const workspaceRoot = await createRoot();
    expect(await new DevStabilityHarness({ workspaceRoot, portOffset: 17 }).resolvePort()).toBe(8282 + 17);
  });

  test("reports a bound port as unavailable and a free one as available", async () => {
    const port = Number(occupy(0).port);
    expect(await DevStabilityHarness.isPortFree(port)).toBe(false);
    for (const server of servers.splice(0)) server.stop(true);
    expect(await DevStabilityHarness.isPortFree(port)).toBe(true);
  });
});

describe("dev stability harness fixture sweep", () => {
  test("removes fixtures whose owning test process is gone and keeps live ones", async () => {
    const workspaceRoot = await createRoot();
    // A pid that cannot be running: one below the 32-bit max, never assigned in practice.
    const abandoned = `${DevStabilityHarness.fixturePrefix}2147483646-1700000000000`;
    const live = `${DevStabilityHarness.fixturePrefix}${process.pid}-1700000000001`;
    for (const name of [abandoned, live]) await mkdir(path.join(workspaceRoot, "apps", name), { recursive: true });

    const swept = await DevStabilityHarness.sweepAbandonedFixtures(workspaceRoot);

    expect(swept).toEqual([abandoned]);
    // `readdir`, not `Bun.file(dir).exists()`, which is false for a directory.
    expect(await readdir(path.join(workspaceRoot, "apps"))).toEqual([live]);
  });

  test("leaves a workspace with no fixtures alone", async () => {
    expect(await DevStabilityHarness.sweepAbandonedFixtures(await createRoot())).toEqual([]);
  });
});
