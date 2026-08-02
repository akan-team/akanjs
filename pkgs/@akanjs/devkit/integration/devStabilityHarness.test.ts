import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DevStabilityHarness } from "./devStabilityHarness";

/**
 * Port allocation and orphan sweeping, asserted directly rather than through the integration suite.
 *
 * Both used to be probabilistic: the offset was drawn at random, and the port was re-derived from the
 * live `apps/` listing on every call. Neither failure shows up in a sequential run on a quiet machine —
 * five consecutive runs of the integration file passed 16/16 with the old code — so the properties have
 * to be asserted here, where a collision can be constructed instead of waited for.
 */
const roots: string[] = [];
const servers: Bun.Server<undefined>[] = [];

const createRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-harness-port-"));
  roots.push(root);
  await mkdir(path.join(root, "apps"), { recursive: true });
  return root;
};

const occupy = (port: number): Bun.Server<undefined> => {
  const server = Bun.serve({ port, fetch: () => new Response("occupied") });
  servers.push(server);
  return server;
};

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true);
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("dev stability harness port allocation", () => {
  test("hands every harness in a process a distinct port", async () => {
    const workspaceRoot = await createRoot();
    const ports: number[] = [];
    // Sequentially, the way the suite creates them — one harness per test.
    for (let i = 0; i < 12; i++) ports.push(await new DevStabilityHarness({ workspaceRoot }).resolvePort());

    expect(new Set(ports).size).toBe(ports.length);
    // Forward-only, so a harness cannot be handed a port a previous host in this process may still be
    // holding while it shuts down — which is the collision the random offset kept producing.
    expect(ports).toEqual([...ports].sort((a, b) => a - b));
  });

  test("returns the same port on every call instead of re-deriving it", async () => {
    const workspaceRoot = await createRoot();
    const harness = new DevStabilityHarness({ workspaceRoot });
    const first = await harness.resolvePort();

    // A rival fixture appearing shifts this app's index among locale-sorted apps, which is exactly what
    // a parallel run does every few seconds. The answer must not move underneath a running test.
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

    // The next cursor step lands exactly on the occupied port, so a probe-less allocator would hand it
    // out and the gateway would exit with "already in use" — it has no fallback for its http port.
    expect(next).not.toBe(taken);
    expect(await DevStabilityHarness.isPortFree(next)).toBe(true);
  });

  test("honours an explicit offset so a probe script can pin its port", async () => {
    const workspaceRoot = await createRoot();
    expect(await new DevStabilityHarness({ workspaceRoot, portOffset: 17 }).resolvePort()).toBe(8282 + 17);
  });

  test("reports a bound port as unavailable and a free one as available", async () => {
    // Port 0 lets the OS pick a free one, so this cannot collide with anything on the machine.
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
    // `readdir`, not `Bun.file(dir).exists()` — that reports false for a directory, so it would have
    // asserted nothing here.
    // Never swept by name alone: a concurrent run's fixtures look identical apart from the pid they
    // carry, and taking one out from under a live suite would break the run this is meant to protect.
    expect(await readdir(path.join(workspaceRoot, "apps"))).toEqual([live]);
  });

  test("leaves a workspace with no fixtures alone", async () => {
    expect(await DevStabilityHarness.sweepAbandonedFixtures(await createRoot())).toEqual([]);
  });
});
