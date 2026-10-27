import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppHosts } from "akanjs/common";
import { RouteHosts } from "./routeHosts";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "routeHosts",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "local",
  AKAN_PUBLIC_OPERATION_MODE: "local",
  SERVER_MODE: "all",
  NODE_ENV: "test",
});

const artifact = { domains: ["shop.example.com"], subRoutes: { docs: ["docs.example.com"] }, basePaths: ["docs"] };

const workspaceWith = async (base: object | null) => {
  const root = await mkdtemp(join(tmpdir(), "akan-route-hosts-"));
  const artifactDir = join(root, ".akan", "artifact");
  await mkdir(artifactDir, { recursive: true });
  if (base) await writeFile(join(artifactDir, "base-artifact.json"), JSON.stringify(base));
  return { root, artifactDir };
};

afterEach(() => {
  AppHosts.reset();
  delete process.env.AKAN_SSR;
});

describe("RouteHosts", () => {
  test("declares the build's route domains and sub-route hosts, AKAN_SUB_ROUTE_HOSTS added", async () => {
    const { root, artifactDir } = await workspaceWith(artifact);
    try {
      expect(RouteHosts.declare(artifactDir, "docs=help.example.com;blog=blog.example.com")).toEqual([
        "shop.example.com",
        "docs.example.com",
        "help.example.com",
      ]);
      expect(AppHosts.allows("shop.example.com")).toBe(true);
      expect(AppHosts.allows("help.example.com:443")).toBe(true);
      expect(AppHosts.allows("blog.example.com")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("declares nothing without a readable artifact", async () => {
    const missing = await workspaceWith(null);
    const broken = await workspaceWith(null);
    await writeFile(join(broken.artifactDir, "base-artifact.json"), "{");
    try {
      expect(RouteHosts.declare(missing.artifactDir)).toEqual([]);
      expect(RouteHosts.declare(broken.artifactDir)).toEqual([]);
    } finally {
      await rm(missing.root, { recursive: true, force: true });
      await rm(broken.root, { recursive: true, force: true });
    }
  });

  test("an api-only boot declares them too", async () => {
    const [{ AkanLib }, { AkanOption }, { AkanServer }] = await Promise.all([
      import("../akanLib"),
      import("../akanOption"),
      import("../akanServer"),
    ]);
    const { root } = await workspaceWith(artifact);
    const cwd = process.cwd();
    const env = {
      workspaceRoot: root,
      database: { sqlite: { filePath: join(root, "akan.db"), journalMode: "WAL", busyTimeoutMs: 1000 } },
      solid: {
        filePath: join(root, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    };
    const lib = new AkanLib("routeHostsTest", { databases: [], services: [], scalars: [], option: new AkanOption() });
    process.env.AKAN_SSR = "0";
    process.chdir(root);
    const server = new AkanServer("routeHosts", env as never, "all", lib);
    try {
      await server.init();
      expect(server.web.ssr).toBe(false);
      expect(AppHosts.allows("shop.example.com")).toBe(true);
      expect(AppHosts.allows("docs.example.com")).toBe(true);
    } finally {
      process.chdir(cwd);
      await server.stop();
      await rm(root, { recursive: true, force: true });
    }
  });
});
