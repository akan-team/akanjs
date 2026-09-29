import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type DevBuildStatus, ROUTE_SEED_INDEX_JSON, type RouteSeedIndex, RouteSeedIndexStore } from "../artifact";
import type { RscAdoptedBundle, RscWorker, RscWorkerReloadInput } from "../rscWorkerHost";
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

const adoptedOf = (input: RscWorkerReloadInput, fallback = "/repo/pages.js"): RscAdoptedBundle => ({
  pagesBundlePath: input.pagesBundlePath ?? fallback,
  buildId: input.buildId,
});

const fakeRsc = (reload = async (input: RscWorkerReloadInput) => adoptedOf(input)) =>
  ({ reload, updateCssAssets: () => undefined }) as unknown as RscWorker;

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
      rsc: fakeRsc(),
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
    run: (
      emit: (message: unknown) => void,
      types: () => string[],
      renderState: RenderState,
      reloads: { pagesBundlePath?: string }[],
      sent: () => HmrMessage[],
      toHost: () => { type?: string; routeId?: string }[],
    ) => Promise<void>,
    {
      pagesBundlePath = "/repo/pages.js",
      reload = async (input: RscWorkerReloadInput) => adoptedOf(input, pagesBundlePath),
    }: { pagesBundlePath?: string; reload?: (input: RscWorkerReloadInput) => Promise<RscAdoptedBundle> } = {},
  ) => {
    const originalSend = process.send;
    const toHost: { type?: string; routeId?: string }[] = [];
    process.send = ((message: { type?: string; routeId?: string }): boolean => {
      toHost.push(message);
      return true;
    }) as typeof process.send;
    const renderState: RenderState = { buildId: 0, cssAssets: {}, cssBytesByUrl: {} };
    const reloads: { pagesBundlePath?: string }[] = [];
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith({ entries: [], globalLayoutFiles: [] }),
      renderState,
      rsc: fakeRsc(async (input) => {
        reloads.push({ pagesBundlePath: input.pagesBundlePath });
        return await reload(input);
      }),
      seedIndex: { entries: [], globalLayoutFiles: [] },
      upgradeHmrWs: () => true,
      pagesBundlePath,
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
        reloads,
        () => messages,
        () => toHost,
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

  test("a restarted backend moves its worker onto the replayed bundle, though that save changed nothing the server renders", async () => {
    await withRegistryController(
      async (emit, types, renderState, reloads) => {
        emit({
          type: "pages-updated",
          data: {
            bundlePath: "/repo/pages-2.js",
            buildId: 8,
            generation: 9,
            changedFiles: ["/repo/apps/a/ui/Card.tsx"],
            serverTouched: false,
          },
        });
        await settle();
        expect(reloads).toEqual([{ pagesBundlePath: "/repo/pages-2.js" }]);
        expect(renderState.buildId).toBe(8);
        expect(types()).toEqual([]);
      },
      { pagesBundlePath: "/repo/pages-boot.js" },
    );
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

  test("a held patch and its RSC refresh wait for the worker to run the new bundle", async () => {
    let finish = (): void => undefined;
    const imported = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await withRegistryController(
      async (emit, types) => {
        emit({
          type: "ssr-updated",
          data: { generation: 4, reload: false, patchUrl: "/p4.js", hold: true, batchGeneration: 9 },
        });
        emit({
          type: "pages-updated",
          data: {
            bundlePath: "/repo/pages-2.js",
            buildId: 8,
            generation: 9,
            changedFiles: ["/repo/apps/a/lib/x.constant.ts"],
            serverTouched: true,
          },
        });
        await settle();
        expect(types()).toEqual([]);
        finish();
        await settle();
        expect(types()).toEqual(["ssr-update:4", "rsc-refresh"]);
      },
      {
        reload: async (input) => {
          await imported;
          return adoptedOf(input);
        },
      },
    );
  });

  test("a bundle that throws on import keeps the tabs' build id, says why, and releases the held patch", async () => {
    await withRegistryController(
      async (emit, types, renderState) => {
        emit({
          type: "ssr-updated",
          data: { generation: 4, reload: false, patchUrl: "/p4.js", hold: true, batchGeneration: 9 },
        });
        emit({
          type: "pages-updated",
          data: {
            bundlePath: "/repo/pages-2.js",
            buildId: 8,
            generation: 9,
            changedFiles: ["/repo/apps/a/common/format.ts"],
            serverTouched: true,
          },
        });
        await settle();
        expect(types()).toEqual(["build-status", "ssr-update:4"]);
        expect(renderState.buildId).toBe(0);
      },
      {
        reload: async () => {
          throw new Error("undefined is not an object");
        },
      },
    );
  });

  test("a failed reload leaves the build id the worker runs, and only the reload that failed reports it", async () => {
    let fail: (adopted: { pagesBundlePath: string; buildId: number }) => void = () => undefined;
    const failed = new Promise<{ pagesBundlePath: string; buildId: number }>((resolve) => {
      fail = resolve;
    });
    await withRegistryController(
      async (emit, types, renderState, _reloads, sent) => {
        const pages = (generation: number, buildId: number) =>
          emit({
            type: "pages-updated",
            data: { bundlePath: `/repo/pages-${generation}.js`, buildId, generation, changedFiles: ["/repo/a.ts"] },
          });
        pages(9, 2);
        pages(10, 3);
        await settle();
        fail({ pagesBundlePath: "/repo/pages-boot.js", buildId: 1 });
        await settle();
        expect(types()).toEqual(["build-status"]);
        expect(sent()).toMatchObject([{ type: "build-status", status: "error", phase: "pages", generation: 10 }]);
        expect(renderState.buildId).toBe(1);
      },
      {
        pagesBundlePath: "/repo/pages-boot.js",
        reload: async () => {
          const adopted = await failed;
          //? The host rejects every waiter with the latest state it asked for.
          throw Object.assign(new Error("broken at import"), {
            adopted,
            failed: { pagesBundlePath: "/repo/pages-10.js", buildId: 3 },
          });
        },
      },
    );
  });

  test("a batch whose bundle the worker took before a later one failed refreshes the tabs onto it", async () => {
    await withRegistryController(
      async (emit, _types, renderState, _reloads, sent) => {
        emit({
          type: "pages-updated",
          data: { bundlePath: "/repo/pages-9.js", buildId: 2, generation: 9, changedFiles: ["/repo/a.ts"] },
        });
        await settle();
        expect(sent().filter((message) => message.type === "rsc-refresh")).toMatchObject([{ buildId: 2 }]);
        expect(sent().some((message) => message.type === "build-status")).toBe(false);
        expect(renderState.buildId).toBe(2);
      },
      {
        pagesBundlePath: "/repo/pages-boot.js",
        reload: async () => {
          throw Object.assign(new Error("broken at import"), {
            adopted: { pagesBundlePath: "/repo/pages-9.js", buildId: 2 },
            failed: { pagesBundlePath: "/repo/pages-10.js", buildId: 3 },
          });
        },
      },
    );
  });

  test("a batch a later pages build superseded tells the tabs the build the worker runs", async () => {
    await withRegistryController(
      async (emit, _types, _renderState, _reloads, sent) => {
        emit({
          type: "pages-updated",
          data: { bundlePath: "/repo/pages-9.js", buildId: 2, generation: 9, changedFiles: ["/repo/a.ts"] },
        });
        await settle();
        expect(sent().filter((message) => message.type === "rsc-refresh")).toMatchObject([{ buildId: 3 }]);
      },
      { reload: async () => ({ pagesBundlePath: "/repo/pages-10.js", buildId: 3 }) },
    );
  });

  test("the bundle the worker settled on is what the next pages build compares against", async () => {
    await withRegistryController(
      async (emit, _types, renderState, reloads) => {
        const clientOnly = (bundlePath: string, buildId: number, generation: number) =>
          emit({
            type: "pages-updated",
            data: { bundlePath, buildId, generation, changedFiles: ["/repo/apps/a/ui/Card.tsx"], serverTouched: false },
          });
        clientOnly("/repo/pages-2.js", 8, 9);
        await settle();
        clientOnly("/repo/pages-2.js", 9, 10);
        await settle();
        expect(reloads.length).toBe(2);
        expect(renderState.buildId).toBe(9);
      },
      {
        pagesBundlePath: "/repo/pages-boot.js",
        reload: async (input) => ({ pagesBundlePath: "/repo/pages-boot.js", buildId: input.buildId }),
      },
    );
  });

  test("an ok of a failure's own generation keeps it for hello, and the fix's ok still clears the overlay", async () => {
    await withRegistryController(async (emit, types) => {
      const ssr = (generation: number, ok: boolean) =>
        emit({
          type: "build-status",
          data: { generation, phase: "ssr", ok, files: [], message: ok ? undefined : "x" },
        });
      ssr(7, false);
      ssr(7, true);
      await settle();
      expect(types()).toEqual(["build-status"]);
      ssr(8, true);
      await settle();
      expect(types()).toEqual(["build-status", "build-status"]);
    });
  });

  test("a route built again at the failure's generation clears it, and another route's ok never does", async () => {
    await withRegistryController(async (emit, types) => {
      const route = (scope: string, ok: boolean, generation = 4) =>
        emit({ type: "build-status", data: { generation, phase: "route", ok, files: [], message: "x", scope } });
      route("/:lang/a", false);
      route("/:lang/b", true);
      route("/:lang/b", true, 5);
      await settle();
      expect(types()).toEqual(["build-status"]);
      route("/:lang/a", true);
      await settle();
      expect(types()).toEqual(["build-status", "build-status"]);
    });
  });

  test("a route that failed is built again once a newer build of the app goes green", async () => {
    await withRegistryController(async (emit, _types, _renderState, _reloads, _sent, toHost) => {
      const routeBuilds = () => toHost().filter((message) => message.type === "build-route");
      const failed = { generation: 7, phase: "route", ok: false, files: ["/repo/apps/a/page/a.tsx"], message: "x" };
      emit({ type: "build-status", data: { ...failed, scope: "/:lang/a" } });
      emit({ type: "build-status", data: { generation: 7, phase: "pages", ok: true, files: [] } });
      await settle();
      expect(routeBuilds()).toEqual([]);
      emit({ type: "build-status", data: { generation: 8, phase: "pages", ok: true, files: [] } });
      await settle();
      expect(routeBuilds()).toMatchObject([{ routeId: "/:lang/a" }]);
    });
  });

  test("a green that arrives while a failed route rebuilds runs that rebuild once more", async () => {
    await withRegistryController(async (emit, _types, _renderState, _reloads, _sent, toHost) => {
      const routeBuilds = () =>
        toHost().filter((message) => message.type === "build-route") as { type: string; id?: number }[];
      const failure = (generation: number) =>
        emit({
          type: "build-status",
          data: {
            generation,
            phase: "route",
            ok: false,
            files: ["/repo/apps/a/page/a.tsx"],
            message: "x",
            scope: "/:lang/a",
          },
        });
      failure(7);
      emit({ type: "build-status", data: { generation: 8, phase: "pages", ok: true, files: [] } });
      await settle();
      expect(routeBuilds()).toHaveLength(1);
      //? The real fix lands while that rebuild still reads the old source, which then fails at the newer generation.
      emit({ type: "build-status", data: { generation: 9, phase: "pages", ok: true, files: [] } });
      failure(9);
      emit({ type: "build-route-res", id: routeBuilds()[0]?.id, ok: false, error: "x" });
      await settle();
      expect(routeBuilds()).toHaveLength(2);
    });
  });

  test("a builder that came back leaves a config change that failed to apply on the overlay", async () => {
    await withRegistryController(async (emit, types) => {
      emit({ type: "build-status", data: { generation: 4, phase: "scan", ok: false, files: [], message: "x" } });
      emit({ type: "build-status", data: { generation: 4, phase: "scan", ok: true, files: [] } });
      await settle();
      expect(types()).toEqual(["build-status"]);
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
      rsc: fakeRsc(),
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

describe("DevHmrController saves during a route's first build", () => {
  //? The route's first build is the first to reach its client files, so no entry maps a file it read yet: only the
  //? file the save names can tell whether the build's result is still good.
  const buildsFor = async (clientDeps: string[]) => {
    const originalSend = process.send;
    const requests: number[] = [];
    process.send = ((message: { type?: string; id?: number }): boolean => {
      if (message.type === "build-route" && typeof message.id === "number") requests.push(message.id);
      return true;
    }) as typeof process.send;
    const seedIndex: RouteSeedIndex = {
      entries: [{ routeId: "/:lang/blog", pattern: "/:lang/blog", seeds: ["/repo/apps/demo/page/blog.tsx"] }],
      globalLayoutFiles: [],
    };
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith(seedIndex),
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: fakeRsc(),
      seedIndex,
      upgradeHmrWs: () => true,
    });
    const requested = async (count: number) => {
      for (let tick = 0; tick < 200 && requests.length < count; tick++) await Bun.sleep(1);
    };
    const answer = (id: number | undefined) => {
      const data = {
        manifestDelta: {},
        ssrManifestDelta: {},
        newEntries: ["/repo/apps/demo/ui/Card.tsx"],
        discoveredEntries: ["/repo/apps/demo/ui/Card.tsx"],
        clientDeps,
      };
      process.emit("message", { type: "build-route-res", id, ok: true, data } as never);
    };
    try {
      const ensured = controller.routeCache.ensure("/:lang/blog", seedIndex.entries[0]?.seeds ?? []);
      await requested(1);
      process.emit("message", {
        type: "invalidate",
        kinds: ["code"],
        files: ["/repo/apps/demo/ui/Button.tsx"],
        generation: 3,
      } as never);
      answer(requests[0]);
      await requested(2);
      if (requests.length > 1) answer(requests[1]);
      await ensured;
      return requests.length;
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  };

  test("builds the route again when the save names a file the build read, and keeps it when it does not", async () => {
    expect(await buildsFor(["/repo/apps/demo/ui/Card.tsx", "/repo/apps/demo/ui/Button.tsx"])).toBe(2);
    expect(await buildsFor(["/repo/apps/demo/ui/Card.tsx"])).toBe(1);
  });
});

describe("DevHmrController route builds that took a save's batch in", () => {
  const card = "/repo/apps/demo/ui/Card.tsx";
  const page = "/repo/apps/demo/page/x.tsx";
  const withRoute = async (
    run: (tools: {
      ensure: () => Promise<unknown>;
      answer: (seenGeneration: number, clientDeps?: string[]) => Promise<void>;
      emit: (message: unknown) => void;
      builds: () => number;
    }) => Promise<void>,
  ) => {
    const originalSend = process.send;
    const requests: number[] = [];
    process.send = ((message: { type?: string; id?: number }): boolean => {
      if (message.type === "build-route" && typeof message.id === "number") requests.push(message.id);
      return true;
    }) as typeof process.send;
    const seedIndex: RouteSeedIndex = {
      entries: [{ routeId: "/:lang/x", pattern: "/:lang/x", seeds: [page] }],
      globalLayoutFiles: [],
    };
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith(seedIndex),
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: fakeRsc(),
      seedIndex,
      upgradeHmrWs: () => true,
    });
    let answered = 0;
    try {
      await run({
        ensure: () => controller.routeCache.ensure("/:lang/x", [page]),
        answer: async (seenGeneration, clientDeps = [card]) => {
          for (let tick = 0; tick < 200 && requests.length <= answered; tick++) await Bun.sleep(1);
          const data = {
            manifestDelta: { [`${card}#Card`]: { id: "ssr-dev:apps/demo/ui/Card.tsx", chunks: [], name: "Card" } },
            ssrManifestDelta: {},
            newEntries: [card],
            discoveredEntries: [card],
            clientDeps,
            clientDepsByEntry: { [card]: clientDeps },
            seenGeneration,
          };
          process.emit("message", { type: "build-route-res", id: requests[answered], ok: true, data } as never);
          answered += 1;
        },
        emit: (message) => process.emit("message", message as never),
        builds: () => requests.length,
      });
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  };
  const settle = async () => {
    for (let tick = 0; tick < 20; tick++) await Bun.sleep(1);
  };

  test("a route's first build that a save overtook builds once more, not again at that save's pages build", async () => {
    for (const [seen, builds] of [
      [3, 2],
      [2, 3],
    ] as const)
      await withRoute(async ({ ensure, answer, emit, builds: count }) => {
        const button = "/repo/apps/demo/ui/Button.tsx";
        const first = ensure();
        emit({ type: "invalidate", kinds: ["code"], files: [button], generation: 3 });
        await answer(2, [card, button]);
        await answer(seen, [card, button]);
        await first;
        emit({
          type: "pages-updated",
          data: {
            bundlePath: "/repo/pages.js",
            buildId: 2,
            generation: 3,
            changedFiles: [button],
            serverTouched: true,
          },
        });
        await settle();
        const again = ensure();
        if (count() > 2) await answer(3, [card, button]);
        await again;
        expect(count()).toBe(builds);
      });
  });

  test("a server file saved beside a known entry still drops a route built before the builder took their batch in", async () => {
    for (const [seen, builds] of [
      [8, 3],
      [9, 2],
    ] as const)
      await withRoute(async ({ ensure, answer, emit, builds: count }) => {
        const first = ensure();
        await answer(0);
        await first;
        emit({ type: "invalidate", kinds: ["code"], files: [card, page], generation: 9 });
        const reloaded = ensure();
        await answer(seen);
        await reloaded;
        emit({
          type: "pages-updated",
          data: {
            bundlePath: "/repo/pages.js",
            buildId: 2,
            generation: 9,
            changedFiles: [card, page],
            serverTouched: true,
          },
        });
        await settle();
        const again = ensure();
        if (count() > 2) await answer(9);
        await again;
        expect(count()).toBe(builds);
      });
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
    const routerIndex = structuredClone(bootIndex);
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
      rsc: fakeRsc(),
      seedIndex: routerIndex,
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
      const matched = RouteSeedIndexStore.match("/en/b/y", routerIndex.entries);
      await controller.routeCache.ensure(matched?.entry.routeId ?? "", matched?.entry.seeds ?? []);

      expect(messages.map((message) => message.type)).toEqual(["reload"]);
      expect(matched?.entry.routeId).toBe("/:lang/b/y");
      expect(buildRequests).toHaveLength(1);
      expect(buildRequests[0]?.seeds).toContain(wrapperOf("b"));
      expect(buildRequests[0]?.graphSeeds).not.toContain(wrapperOf("a"));
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  });
});

describe("DevHmrController superseded pages bundles", () => {
  test("removes the bundle the worker moved past once it adopts a newer one", async () => {
    const seedIndex: RouteSeedIndex = { entries: [], globalLayoutFiles: [] };
    const artifactDir = await artifactDirWith(seedIndex);
    const serverDir = path.join(artifactDir, "server");
    const booted = path.join(serverDir, "pages-booted.js");
    const next = path.join(serverDir, "pages-next.js");
    await Bun.write(booted, "booted");
    await Bun.write(next, "next");
    const aged = new Date(Date.now() - 120_000);
    await utimes(booted, aged, aged);
    const originalSend = process.send;
    process.send = ((): boolean => true) as typeof process.send;
    const controller = new DevHmrController({
      artifactDir,
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: fakeRsc(),
      seedIndex,
      upgradeHmrWs: () => true,
      pagesBundlePath: booted,
    });
    try {
      process.emit("message", {
        type: "pages-updated",
        data: { bundlePath: next, buildId: 2, generation: 2, changedFiles: [], serverTouched: true },
      } as never);
      for (let tick = 0; tick < 200 && (await Bun.file(booted).exists()); tick++) await Bun.sleep(5);
      expect(await Bun.file(booted).exists()).toBe(false);
      expect(await Bun.file(next).exists()).toBe(true);
    } finally {
      controller.dispose();
      process.send = originalSend;
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});

describe("DevHmrController HMR socket origin", () => {
  test("upgrades the serving host's pages and non-browser callers, and refuses a page on another origin", async () => {
    const seedIndex: RouteSeedIndex = { entries: [], globalLayoutFiles: [] };
    const originalSend = process.send;
    process.send = ((): boolean => true) as typeof process.send;
    const upgraded: string[] = [];
    const controller = new DevHmrController({
      artifactDir: await artifactDirWith(seedIndex),
      renderState: { buildId: 0, cssAssets: {}, cssBytesByUrl: {} },
      rsc: fakeRsc(),
      seedIndex,
      upgradeHmrWs: (req) => upgraded.push(req.headers.get("origin") ?? "(none)") > 0,
    });
    const upgrade = (headers: Record<string, string>) =>
      controller.handleWs(new Request("http://akan-child/_akan/hmr", { headers }))?.status ?? "upgraded";
    try {
      expect(upgrade({ origin: "http://localhost:4200", "x-forwarded-host": "localhost:4200" })).toBe("upgraded");
      expect(upgrade({ origin: "https://demo.tunnel.test", "x-forwarded-host": "demo.tunnel.test" })).toBe("upgraded");
      expect(upgrade({})).toBe("upgraded");
      expect(upgrade({ origin: "https://evil.test", "x-forwarded-host": "localhost:4200" })).toBe(403);
      expect(upgraded).toEqual(["http://localhost:4200", "https://demo.tunnel.test", "(none)"]);
    } finally {
      controller.dispose();
      process.send = originalSend;
    }
  });
});
