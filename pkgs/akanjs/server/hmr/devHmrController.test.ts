import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type DevBuildStatus, ROUTE_SEED_INDEX_JSON, type RouteSeedIndex } from "../artifact";
import type { RscWorker } from "../rscWorkerHost";
import type { RenderState } from "../types";
import {
  DevHmrController,
  devBuildStatusToHmrMessage,
  isAkanRuntimeMetadataFile,
  manifestClientEntriesForFiles,
} from "./devHmrController";
import { HMR_WS_TOPIC, type HmrMessage } from "./wsHub";

const artifactDirWith = async (seedIndex: RouteSeedIndex) => {
  const artifactDir = await mkdtemp(path.join(os.tmpdir(), "akan-dev-hmr-"));
  await Bun.write(path.join(artifactDir, ROUTE_SEED_INDEX_JSON), JSON.stringify(seedIndex));
  return artifactDir;
};

describe("DevHmrController runtime metadata detection", () => {
  test("detects generated app client runtime metadata files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/useClient.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/dict.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/sig.ts")).toBe(true);
  });

  test("detects app and library dictionary/signal module files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/_akan/akan.dictionary.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/_akan/akan.signal.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/libs/shared/lib/admin/admin.dictionary.ts")).toBe(true);
    expect(isAkanRuntimeMetadataFile("/repo/libs/shared/lib/admin/admin.signal.ts")).toBe(true);
  });

  test("ignores unrelated source files", () => {
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/page/_index.tsx")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/task/task.service.ts")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/lib/task/dictionary.ts")).toBe(false);
    expect(isAkanRuntimeMetadataFile("/repo/apps/demo/page/example.signal.ts")).toBe(false);
  });
});

describe("DevHmrController client manifest entry detection", () => {
  test("detects changed client entries from relative manifest keys", () => {
    const workspaceRoot = "/repo";
    const changed = manifestClientEntriesForFiles(
      ["/repo/apps/demo/ui/Header.tsx"],
      {
        "apps/demo/ui/Header.tsx#Header": {
          id: "/_akan/client/header.js",
          chunks: ["/_akan/client/header.js"],
          name: "Header",
          async: true,
        },
        "apps/demo/ui/Footer.tsx#Footer": {
          id: "/_akan/client/footer.js",
          chunks: ["/_akan/client/footer.js"],
          name: "Footer",
          async: true,
        },
      },
      workspaceRoot,
    );

    expect(changed).toEqual(new Set([path.resolve("/repo/apps/demo/ui/Header.tsx")]));
  });
});

describe("DevHmrController build status HMR messages", () => {
  const status = (overrides: Partial<DevBuildStatus>): DevBuildStatus => ({
    generation: 1,
    phase: "pages",
    ok: false,
    files: ["/repo/apps/demo/page/_index.tsx"],
    message: "Build failed",
    ...overrides,
  });

  test("broadcasts failed build status as an error overlay message", () => {
    expect(devBuildStatusToHmrMessage(status({ generation: 12, phase: "css" }))).toEqual({
      type: "build-status",
      status: "error",
      generation: 12,
      phase: "css",
      message: "Build failed",
      files: 1,
    });
  });

  test("broadcasts ok only when a newer status recovers a failed phase", () => {
    const previous = status({ generation: 12, phase: "pages", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 11, phase: "pages", ok: true }), previous)).toBeNull();
    expect(devBuildStatusToHmrMessage(status({ generation: 13, phase: "css", ok: true }))).toBeNull();
    expect(devBuildStatusToHmrMessage(status({ generation: 13, phase: "pages", ok: true }), previous)).toEqual({
      type: "build-status",
      status: "ok",
      generation: 13,
      phase: "pages",
      message: "Build failed",
      files: 1,
    });
  });

  test("does not clear a failure with a stale recovered generation", () => {
    const previous = status({ generation: 22, phase: "csr", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 21, phase: "csr", ok: true }), previous)).toBeNull();
  });

  test("allows same generation backend recovery after a restart succeeds", () => {
    const previous = status({ generation: 12, phase: "backend", ok: false });

    expect(devBuildStatusToHmrMessage(status({ generation: 12, phase: "backend", ok: true }), previous)).toEqual({
      type: "build-status",
      status: "ok",
      generation: 12,
      phase: "backend",
      message: "Build failed",
      files: 1,
    });
  });
});

describe("DevHmrController pages-updated broadcast", () => {
  const broadcastTypesFor = async (changedFile: string) => {
    const originalSend = process.send;
    process.send = ((): boolean => true) as typeof process.send;
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith({ entries: [], globalLayoutFiles: [] }),
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: { reload: async () => undefined, updateCssAssets: () => undefined } as unknown as RscWorker,
      seedIndex: { entries: [], globalLayoutFiles: [] },
      upgradeHmrWs: () => true,
    });
    const messages: HmrMessage[] = [];
    controller.hub.setPublisher((_topic, payload) => messages.push(JSON.parse(payload) as HmrMessage));
    try {
      process.emit("message", {
        type: "pages-updated",
        data: { bundlePath: "/repo/pages.js", buildId: 7, changedFiles: [changedFile] },
      });
      for (let tick = 0; tick < 100 && messages.length === 0; tick++) await Bun.sleep(1);
      return messages.map((message) => message.type);
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  };

  test("fully reloads when the framework's HMR client, RSC client or SSR renderer source changes", async () => {
    for (const file of ["hmr/clientScript.ts", "rscClient.tsx", "ssrFromRscRenderer.tsx"]) {
      expect(await broadcastTypesFor(`/repo/pkgs/akanjs/server/${file}`)).toEqual(["reload"]);
    }
  });

  test("refreshes RSC in place for an ordinary non-client source change", async () => {
    expect(await broadcastTypesFor("/repo/apps/demo/lib/task/task.service.ts")).toEqual(["rsc-refresh"]);
  });
});

describe("DevHmrController SSR registry updates", () => {
  const withRegistryController = async (
    run: (emit: (message: unknown) => void, types: () => string[], renderState: RenderState) => Promise<void>,
  ) => {
    const originalSend = process.send;
    process.send = ((): boolean => true) as typeof process.send;
    const renderState: RenderState = { buildId: 0, cssAssets: {}, cssBytesByUrl: {} };
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith({ entries: [], globalLayoutFiles: [] }),
      renderState,
      rsc: { reload: async () => undefined, updateCssAssets: () => undefined } as unknown as RscWorker,
      seedIndex: { entries: [], globalLayoutFiles: [] },
      upgradeHmrWs: () => true,
    });
    const messages: HmrMessage[] = [];
    controller.hub.setPublisher((topic, payload) => {
      if (topic === HMR_WS_TOPIC) messages.push(JSON.parse(payload) as HmrMessage);
    });
    try {
      await run(
        (message) => process.emit("message", message as never),
        () =>
          messages.map((message) =>
            message.type === "ssr-update" ? `ssr-update:${message.generation}` : message.type,
          ),
        renderState,
      );
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  };
  const settle = async () => {
    for (let tick = 0; tick < 20; tick++) await Bun.sleep(1);
  };

  test("a patch whose save changed server output goes out with that batch's RSC refresh, ahead of it", async () => {
    await withRegistryController(async (emit, types) => {
      emit({
        type: "ssr-updated",
        data: { generation: 4, reload: false, patchUrl: "/p4.js", hold: true, batchGeneration: 9 },
      });
      emit({ type: "ssr-updated", data: { generation: 5, reload: false, patchUrl: "/p5.js" } });
      await settle();
      expect(types()).toEqual([]);
      emit({
        type: "pages-updated",
        data: {
          bundlePath: "/repo/pages.js",
          buildId: 8,
          generation: 9,
          changedFiles: ["/repo/apps/a/lib/x.constant.ts"],
          serverTouched: true,
        },
      });
      await settle();
      expect(types()).toEqual(["ssr-update:4", "ssr-update:5", "rsc-refresh"]);
    });
  });

  test("a save that changed nothing the server renders gets its patch at once, and keeps the build id tabs hold", async () => {
    await withRegistryController(async (emit, types, renderState) => {
      emit({ type: "ssr-updated", data: { generation: 4, reload: false, patchUrl: "/p4.js", batchGeneration: 9 } });
      await settle();
      expect(types()).toEqual(["ssr-update:4"]);
      emit({
        type: "pages-updated",
        data: {
          bundlePath: "/repo/pages.js",
          buildId: 8,
          generation: 9,
          changedFiles: ["/repo/apps/a/ui/Card.tsx"],
          serverTouched: false,
        },
      });
      await settle();
      expect(types()).toEqual(["ssr-update:4"]);
      expect(renderState.buildId).toBe(0);
    });
  });

  test("the registry's first build reaches no tab: none holds a module of it", async () => {
    await withRegistryController(async (emit, types) => {
      emit({
        type: "ssr-updated",
        data: { generation: 1, reload: true, reason: "first build", first: true, epoch: 5 },
      });
      emit({ type: "ssr-updated", data: { generation: 2, reload: false, patchUrl: "/p2.js" } });
      await settle();
      expect(types()).toEqual(["ssr-update:2"]);
    });
  });

  test("a failed pages build releases the held patch without an RSC refresh", async () => {
    await withRegistryController(async (emit, types) => {
      emit({
        type: "ssr-updated",
        data: { generation: 4, reload: false, patchUrl: "/p4.js", hold: true, batchGeneration: 9 },
      });
      emit({ type: "build-status", data: { generation: 9, phase: "pages", ok: false, files: [], message: "boom" } });
      await settle();
      expect(types()).toEqual(["build-status", "ssr-update:4"]);
    });
  });
});

describe("DevHmrController registry state for hello", () => {
  test("reads the registries on disk, so a build this backend never heard of still reaches a reconnecting tab", async () => {
    const originalSend = process.send;
    process.send = ((): boolean => true) as typeof process.send;
    const artifactDir = await artifactDirWith({ entries: [], globalLayoutFiles: [] });
    const renderState: RenderState = { buildId: 0, cssAssets: {}, cssBytesByUrl: {} };
    const controller = new DevHmrController({
      artifactDir,
      renderState,
      rsc: { reload: async () => undefined, updateCssAssets: () => undefined } as unknown as RscWorker,
      seedIndex: { entries: [], globalLayoutFiles: [] },
      upgradeHmrWs: () => true,
    });
    try {
      expect(renderState.ssrGeneration).toBeUndefined();
      await Bun.write(path.join(artifactDir, "ssr-dev/manifest.json"), JSON.stringify({ generation: 7, epoch: 3 }));
      await Bun.write(path.join(artifactDir, "csr-dev/manifest.json"), JSON.stringify({ generation: 2 }));
      controller.refreshRegistryState();
      expect(renderState).toMatchObject({ ssrGeneration: 7, ssrEpoch: 3, csrGeneration: 2 });

      // A held patch is on disk already: a tab reconnecting now is told the last generation sent, not that one.
      process.emit("message", {
        type: "ssr-updated",
        data: { generation: 8, reload: false, patchUrl: "/p8.js", hold: true, batchGeneration: 4 },
      } as never);
      await Bun.write(path.join(artifactDir, "ssr-dev/manifest.json"), JSON.stringify({ generation: 8, epoch: 3 }));
      await Bun.sleep(5);
      controller.refreshRegistryState();
      expect(renderState.ssrGeneration).toBe(7);

      process.emit("message", {
        type: "build-status",
        data: { generation: 4, phase: "ssr", ok: false, files: [], message: "Unexpected ;" },
      } as never);
      await Bun.sleep(5);
      expect(controller.buildErrorMessages()).toEqual([
        { type: "build-status", status: "error", generation: 4, phase: "ssr", message: "Unexpected ;", files: 0 },
      ]);
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  });
});

describe("DevHmrController route ensure", () => {
  test("builds the nearest layout route for a path only a route prefix matches", async () => {
    const originalSend = process.send;
    const requestedRouteIds: string[] = [];
    process.send = ((message: { type?: string; id?: number; routeId?: string }): boolean => {
      if (message.type !== "build-route" || !message.routeId) return true;
      requestedRouteIds.push(message.routeId);
      const data = { manifestDelta: {}, ssrManifestDelta: {}, newEntries: [], clientDeps: [] };
      queueMicrotask(() => process.emit("message", { type: "build-route-res", id: message.id, ok: true, data }));
      return true;
    }) as typeof process.send;
    const seedIndex: RouteSeedIndex = {
      entries: [{ routeId: "/:lang/blog", pattern: "/:lang/blog", seeds: ["/repo/apps/demo/page/blog/_layout.tsx"] }],
      globalLayoutFiles: [],
    };
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith(seedIndex),
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: { reload: async () => undefined, updateCssAssets: () => undefined } as unknown as RscWorker,
      seedIndex,
      upgradeHmrWs: () => true,
    });
    try {
      await controller.ensureRoute(new URL("https://example.test/ko/blog/missing"));
      expect(requestedRouteIds).toEqual(["/:lang/blog"]);
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  });
});

describe("DevHmrController route tree changes", () => {
  test("adopts the rebuilt seed index so a moved override seeds route builds from where it went", async () => {
    const page = "/repo/apps/demo/page";
    const wrapperOf = (dir: string) => `/repo/apps/demo/.akan/generated/overrides/${dir}_overrides_tsx.tsx`;
    const bootIndex: RouteSeedIndex = {
      entries: [
        { routeId: "/:lang/a/x", pattern: "/:lang/a/x", seeds: [wrapperOf("a"), `${page}/a/x.tsx`] },
        { routeId: "/:lang/b/y", pattern: "/:lang/b/y", seeds: [`${page}/b/y.tsx`] },
      ],
      globalLayoutFiles: [],
    };
    const movedIndex: RouteSeedIndex = {
      entries: [
        { routeId: "/:lang/a/x", pattern: "/:lang/a/x", seeds: [`${page}/a/x.tsx`] },
        { routeId: "/:lang/b/y", pattern: "/:lang/b/y", seeds: [wrapperOf("b"), `${page}/b/y.tsx`] },
      ],
      globalLayoutFiles: [],
    };
    const artifactDir = await artifactDirWith(bootIndex);
    const originalSend = process.send;
    const buildRequests: { seeds: string[]; graphSeeds: string[] }[] = [];
    process.send = ((message: { type?: string; id?: number; seeds?: string[]; graphSeeds?: string[] }): boolean => {
      if (message.type !== "build-route") return true;
      buildRequests.push({ seeds: message.seeds ?? [], graphSeeds: message.graphSeeds ?? [] });
      const data = { manifestDelta: {}, ssrManifestDelta: {}, newEntries: [], clientDeps: [] };
      queueMicrotask(() => process.emit("message", { type: "build-route-res", id: message.id, ok: true, data }));
      return true;
    }) as typeof process.send;
    const controller = new DevHmrController({
      artifactDir,
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: { reload: async () => undefined, updateCssAssets: () => undefined } as unknown as RscWorker,
      seedIndex: structuredClone(bootIndex),
      upgradeHmrWs: () => true,
    });
    const messages: HmrMessage[] = [];
    controller.hub.setPublisher((_topic, payload) => messages.push(JSON.parse(payload) as HmrMessage));
    try {
      await Bun.write(path.join(artifactDir, ROUTE_SEED_INDEX_JSON), JSON.stringify(movedIndex));
      process.emit("message", {
        type: "pages-updated",
        data: { bundlePath: "/repo/pages.js", buildId: 8, changedFiles: [`${page}/b/_overrides.tsx`] },
      });
      for (let tick = 0; tick < 100 && messages.length === 0; tick++) await Bun.sleep(1);
      await controller.ensureRoute(new URL("https://example.test/en/b/y"));

      expect(messages.map((message) => message.type)).toEqual(["reload"]);
      expect(controller.routeIdsForPath("/en/b/y")).toEqual(["/:lang/b/y"]);
      expect(buildRequests).toHaveLength(1);
      expect(buildRequests[0]?.seeds).toContain(wrapperOf("b"));
      expect(buildRequests[0]?.graphSeeds).not.toContain(wrapperOf("a"));
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  });
});
