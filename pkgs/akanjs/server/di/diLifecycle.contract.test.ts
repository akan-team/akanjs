import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { adapt, type LlmAdaptor, LlmAdaptorRole, ServiceModel, SolidPubSub, serve } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { internal } from "../../signal/internal";
import { serverSignal } from "../../signal/serverSignal";
import { AkanLib } from "../akanLib";
import { AkanOption } from "../akanOption";
import { HostBasePathWebProxy, LocaleWebProxy } from "../proxy";
import {
  ServerResolverTestEndpoint,
  ServerResolverTestInternal,
  ServerResolverTestServerSignal,
  ServerResolverTestSlice,
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel,
  validId,
} from "../resolver/resolver.contract.fixture";

describe("DiLifecycle declaration-to-runtime contract", () => {
  test("prepends default web proxies before library proxies", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "serverLifecycle";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    class CustomWebProxy {
      static readonly refName = "CustomWebProxy";
      use() {}
    }

    const env = {} satisfies BackendEnv;
    const lib = new AkanLib("serverLifecycleTest", {
      databases: [],
      services: [],
      scalars: [],
      option: new AkanOption().applyWebProxy(CustomWebProxy),
    });

    const lifecycle = new DiLifecycle({ env }, lib);

    expect(lifecycle.webProxies).toEqual([LocaleWebProxy, HostBasePathWebProxy, CustomWebProxy]);
  });

  test("assembles AkanLib declarations into registry, live services, and routes", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "serverLifecycle";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-"));
    const env = {
      workspaceRoot: tmp,
      database: {
        sqlite: {
          filePath: join(tmp, "akan.db"),
          journalMode: "WAL",
          busyTimeoutMs: 1000,
          synchronous: "NORMAL",
          foreignKeys: true,
        },
      },
      solid: {
        filePath: join(tmp, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        synchronous: "NORMAL",
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    } satisfies BackendEnv & { workspaceRoot: string };
    const lib = new AkanLib("serverLifecycleTest", {
      databases: [
        {
          constant: serverResolverTestConstant,
          database: serverResolverTestDatabase,
          service: serverResolverTestServiceModel,
          signal: {
            endpoint: ServerResolverTestEndpoint,
            slice: ServerResolverTestSlice,
            internal: ServerResolverTestInternal,
            server: ServerResolverTestServerSignal,
          },
        },
      ],
      services: [],
      scalars: [],
      option: new AkanOption(),
    });
    const lifecycle = new DiLifecycle({ env }, lib);

    try {
      const routes = await lifecycle.initializeAll();

      expect(lifecycle.registry.adaptorCls.has("serverResolverTestItemModel")).toBe(true);
      expect(lifecycle.live.adaptor.has("serverResolverTestItemModel")).toBe(true);
      expect(lifecycle.registry.serviceCls.has("serverResolverTestItem")).toBe(true);
      expect(lifecycle.live.service.has("serverResolverTestItem")).toBe(true);
      expect(lifecycle.registry.serverSignalCls.has("serverResolverTestItemSignal")).toBe(true);
      expect(lifecycle.registry.internalCls.has("serverResolverTestItemInternal")).toBe(true);
      expect(lifecycle.live.internal.has("serverResolverTestItemInternal")).toBe(true);
      expect(lifecycle.registry.endpointCls.has("serverResolverTestItemEndpoint")).toBe(true);
      expect(lifecycle.live.sliceCls.has("serverResolverTestItem")).toBe(true);

      expect(Object.keys(routes.routes ?? {})).toEqual(
        expect.arrayContaining([
          "/getTitle/:id",
          "/serverResolverTestItem/updateTitle/:id",
          "/serverResolverTestItem/serverResolverTestItem/:serverResolverTestItemId",
          "/serverResolverTestItem/serverResolverTestItemListInCategory",
        ]),
      );
      expect(Object.keys(routes.wsRoutes ?? {})).toEqual(expect.arrayContaining(["roomFeed", "echoMessage"]));
      expect(routes.routeOptions?.["/getTitle/:id"]).toEqual({ globalPrefix: false });

      const service = lifecycle.live.service.get("serverResolverTestItem") as {
        createServerResolverTestItem(data: Record<string, unknown>): Promise<Record<string, unknown>>;
        listInCategory(...args: unknown[]): Promise<unknown[]>;
      };
      const created = await service.createServerResolverTestItem({
        ownerId: validId,
        category: "news",
        title: "Alpha",
        resolvedLabel: "resolved",
        count: 1,
        tags: ["featured"],
        nested: { label: "Nested" },
      });
      expect(created).toMatchObject({
        category: "news",
        parentPostCreate: true,
        childPostCreate: true,
      });
      expect(await service.listInCategory("news", false, { limit: 10 })).toHaveLength(1);

      const websocket = lifecycle.registry.adaptor.get(SolidPubSub) as SolidPubSub | undefined;
      expect(websocket).toBeDefined();
    } finally {
      await lifecycle.destroyAll();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("skips disabled service modules and services that depend on their signals", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "serverLifecycle";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    class LocalBuildService extends serve("localBuild" as const, { enabled: false }, () => ({})) {}
    const localBuildServiceModel = ServiceModel.from(LocalBuildService);
    class LocalBuildEndpoint extends endpoint(localBuildServiceModel, () => ({})) {}
    class LocalBuildInternal extends internal(localBuildServiceModel, () => ({})) {}
    class LocalBuildSignal extends serverSignal(LocalBuildEndpoint, LocalBuildInternal) {}

    class ProjectBuildService extends serve("projectBuild" as const, ({ signal }) => ({
      localBuildSignal: signal<InstanceType<typeof LocalBuildSignal>>(),
    })) {}
    const projectBuildServiceModel = ServiceModel.from(ProjectBuildService);
    class ProjectBuildEndpoint extends endpoint(projectBuildServiceModel, () => ({})) {}
    class ProjectBuildInternal extends internal(projectBuildServiceModel, () => ({})) {}
    class ProjectBuildSignal extends serverSignal(ProjectBuildEndpoint, ProjectBuildInternal) {}

    const env = {} satisfies BackendEnv;
    const lib = new AkanLib("serverLifecycleTest", {
      databases: [],
      services: [
        {
          service: localBuildServiceModel,
          signal: { endpoint: LocalBuildEndpoint, internal: LocalBuildInternal, server: LocalBuildSignal },
        },
        {
          service: projectBuildServiceModel,
          signal: { endpoint: ProjectBuildEndpoint, internal: ProjectBuildInternal, server: ProjectBuildSignal },
        },
      ],
      scalars: [],
      option: new AkanOption(),
    });
    const lifecycle = new DiLifecycle({ env }, lib);

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("localBuild")).toBe(false);
    expect(lifecycle.registry.serverSignalCls.has("localBuildSignal")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("projectBuild")).toBe(false);
    expect(lifecycle.registry.serverSignalCls.has("projectBuildSignal")).toBe(false);
    expect(lifecycle.live.service.has("localBuild")).toBe(false);
    expect(lifecycle.live.service.has("projectBuild")).toBe(false);
  });

  test("skips disabled database modules before document, service, and signal registration", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "serverLifecycle";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-disabled-"));
    const env = {
      workspaceRoot: tmp,
      database: {
        sqlite: {
          filePath: join(tmp, "akan.db"),
          journalMode: "WAL",
          busyTimeoutMs: 1000,
          synchronous: "NORMAL",
          foreignKeys: true,
        },
      },
      solid: {
        filePath: join(tmp, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        synchronous: "NORMAL",
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    } satisfies BackendEnv & { workspaceRoot: string };
    class DisabledServerResolverTestService extends serve(serverResolverTestDatabase, { enabled: false }, () => ({})) {}
    const disabledServiceModel = ServiceModel.fromModel(
      DisabledServerResolverTestService,
      serverResolverTestConstant,
      serverResolverTestDatabase,
    );
    const lib = new AkanLib("serverLifecycleTest", {
      databases: [
        {
          constant: serverResolverTestConstant,
          database: serverResolverTestDatabase,
          service: disabledServiceModel,
          signal: {
            endpoint: ServerResolverTestEndpoint,
            slice: ServerResolverTestSlice,
            internal: ServerResolverTestInternal,
            server: ServerResolverTestServerSignal,
          },
        },
      ],
      services: [],
      scalars: [],
      option: new AkanOption(),
    });
    const lifecycle = new DiLifecycle({ env }, lib);

    try {
      await expect(lifecycle.initializeAll()).resolves.toBeDefined();
      expect(lifecycle.registry.adaptorCls.has("serverResolverTestItemModel")).toBe(false);
      expect(lifecycle.live.adaptor.has("serverResolverTestItemModel")).toBe(false);
      expect(lifecycle.registry.serviceCls.has("serverResolverTestItem")).toBe(false);
      expect(lifecycle.registry.serverSignalCls.has("serverResolverTestItemSignal")).toBe(false);
      expect(lifecycle.registry.internalCls.has("serverResolverTestItemInternal")).toBe(false);
      expect(lifecycle.registry.endpointCls.has("serverResolverTestItemEndpoint")).toBe(false);
      expect(lifecycle.live.sliceCls.has("serverResolverTestItem")).toBe(false);
    } finally {
      await lifecycle.destroyAll();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("DiLifecycle adaptor overrides", () => {
  test("applyAdaptor rebinds a predefined role and the framework agent module runs over it", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "adaptorOverride";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    class FakeLlm extends adapt("fakeLlm" as const, () => ({})) implements LlmAdaptor {
      async chat() {
        return { text: "faked", stop: "end" as const };
      }
    }

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-"));
    const env = {
      workspaceRoot: tmp,
      database: {
        sqlite: {
          filePath: join(tmp, "akan.db"),
          journalMode: "WAL",
          busyTimeoutMs: 1000,
          synchronous: "NORMAL",
          foreignKeys: true,
        },
      },
      solid: {
        filePath: join(tmp, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        synchronous: "NORMAL",
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    } satisfies BackendEnv & { workspaceRoot: string };
    const lib = new AkanLib("llmOverrideTest", {
      databases: [],
      services: [],
      scalars: [],
      option: new AkanOption().applyAdaptor(LlmAdaptorRole, FakeLlm),
    });
    const lifecycle = new DiLifecycle({ env }, lib);
    try {
      await lifecycle.initializeAll();
      expect(lifecycle.registry.adaptorRole.get(LlmAdaptorRole)).toBe(FakeLlm);
      const agentService = lifecycle.live.service.get("agent") as {
        runTurn(request: object): Promise<{ text: string }>;
      };
      expect(agentService).toBeDefined();
      const turn = await agentService.runTurn({ messages: [], tools: [], context: [] });
      expect(turn.text).toBe("faked");
    } finally {
      await lifecycle.destroyAll();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("setLlm reaches whichever adaptor fills the LLM role, as the llmOption use", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "llmOption";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-llm-"));
    const env = {
      hostname: "llmOption",
      workspaceRoot: tmp,
      database: {
        sqlite: {
          filePath: join(tmp, "akan.db"),
          journalMode: "WAL",
          busyTimeoutMs: 1000,
          synchronous: "NORMAL",
          foreignKeys: true,
        },
      },
      solid: {
        filePath: join(tmp, "solid.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        synchronous: "NORMAL",
        cleanupIntervalMs: 60_000,
        queuePollIntervalMs: 60_000,
        queueLeaseMs: 30_000,
      },
    } satisfies BackendEnv & { workspaceRoot: string };
    const dependency = new AkanLib("llmLibTest", {
      databases: [],
      services: [],
      scalars: [],
      option: new AkanOption().setLlm({ model: "lib-model", host: "https://lib.example.com" }),
    });
    const app = new AkanLib("llmAppTest", {
      databases: [],
      services: [],
      scalars: [],
      option: new AkanOption().setLlm((options) => ({ apiKey: `key-${options.hostname}`, model: "app-model" })),
    });
    const lifecycle = new DiLifecycle({ env }, dependency, app);
    try {
      await lifecycle.initializeAll();
      // Libs merge in mount order with the app last, so an app narrows one field without restating the rest.
      expect(lifecycle.registry.uses.get("llmOption")).toEqual({
        apiKey: "key-llmOption",
        model: "app-model",
        host: "https://lib.example.com",
      });
    } finally {
      await lifecycle.destroyAll();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("DiLifecycle duplicate registrations", () => {
  test("refuses two libs claiming one use key", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "duplicateUse";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const env = {} satisfies BackendEnv;
    const makeLib = (name: string) =>
      new AkanLib(name, {
        databases: [],
        services: [],
        scalars: [],
        option: new AkanOption().use({ duplicateUseApi: { name } }),
      });
    const lifecycle = new DiLifecycle({ env }, makeLib("duplicateUseA"), makeLib("duplicateUseB"));

    await expect(lifecycle.initializeAll()).rejects.toThrow(
      '"duplicateUseApi" is registered by lib "duplicateUseA" and by lib "duplicateUseB"',
    );
  });

  test("refuses two adaptor classes claiming one refName", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "duplicateAdaptor";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    class FirstRival extends adapt("duplicateRival" as const, () => ({})) {}
    class SecondRival extends adapt("duplicateRival" as const, () => ({})) {}

    class DuplicateAlphaService extends serve("duplicateAlpha" as const, ({ plug }) => ({
      rival: plug(FirstRival),
    })) {}
    const duplicateAlphaServiceModel = ServiceModel.from(DuplicateAlphaService);
    class DuplicateAlphaEndpoint extends endpoint(duplicateAlphaServiceModel, () => ({})) {}
    class DuplicateAlphaInternal extends internal(duplicateAlphaServiceModel, () => ({})) {}
    class DuplicateAlphaSignal extends serverSignal(DuplicateAlphaEndpoint, DuplicateAlphaInternal) {}

    class DuplicateBetaService extends serve("duplicateBeta" as const, ({ plug }) => ({
      rival: plug(SecondRival),
    })) {}
    const duplicateBetaServiceModel = ServiceModel.from(DuplicateBetaService);
    class DuplicateBetaEndpoint extends endpoint(duplicateBetaServiceModel, () => ({})) {}
    class DuplicateBetaInternal extends internal(duplicateBetaServiceModel, () => ({})) {}
    class DuplicateBetaSignal extends serverSignal(DuplicateBetaEndpoint, DuplicateBetaInternal) {}

    const env = {} satisfies BackendEnv;
    const lib = new AkanLib("duplicateAdaptorTest", {
      databases: [],
      services: [
        {
          service: duplicateAlphaServiceModel,
          signal: { endpoint: DuplicateAlphaEndpoint, internal: DuplicateAlphaInternal, server: DuplicateAlphaSignal },
        },
        {
          service: duplicateBetaServiceModel,
          signal: { endpoint: DuplicateBetaEndpoint, internal: DuplicateBetaInternal, server: DuplicateBetaSignal },
        },
      ],
      scalars: [],
      option: new AkanOption(),
    });

    expect(() => new DiLifecycle({ env }, lib)).toThrow(
      '"duplicateRival" is registered by service "duplicateAlpha" and by service "duplicateBeta"',
    );
  });
});

describe("DiLifecycle module selection", () => {
  const buildSelectionLib = () => {
    class SelectionLeafService extends serve("selectionLeaf" as const, () => ({})) {}
    const selectionLeafServiceModel = ServiceModel.from(SelectionLeafService);
    class SelectionLeafEndpoint extends endpoint(selectionLeafServiceModel, () => ({})) {}
    class SelectionLeafInternal extends internal(selectionLeafServiceModel, () => ({})) {}
    class SelectionLeafSignal extends serverSignal(SelectionLeafEndpoint, SelectionLeafInternal) {}

    class SelectionRootService extends serve("selectionRoot" as const, ({ service }) => ({
      selectionLeafService: service<InstanceType<typeof SelectionLeafService>>(),
    })) {}
    const selectionRootServiceModel = ServiceModel.from(SelectionRootService);
    class SelectionRootEndpoint extends endpoint(selectionRootServiceModel, () => ({})) {}
    class SelectionRootInternal extends internal(selectionRootServiceModel, () => ({})) {}
    class SelectionRootSignal extends serverSignal(SelectionRootEndpoint, SelectionRootInternal) {}

    class SelectionAsideService extends serve("selectionAside" as const, () => ({})) {}
    const selectionAsideServiceModel = ServiceModel.from(SelectionAsideService);
    class SelectionAsideEndpoint extends endpoint(selectionAsideServiceModel, () => ({})) {}
    class SelectionAsideInternal extends internal(selectionAsideServiceModel, () => ({})) {}
    class SelectionAsideSignal extends serverSignal(SelectionAsideEndpoint, SelectionAsideInternal) {}

    return new AkanLib("moduleSelectionTest", {
      databases: [],
      services: [
        {
          service: selectionLeafServiceModel,
          signal: { endpoint: SelectionLeafEndpoint, internal: SelectionLeafInternal, server: SelectionLeafSignal },
        },
        {
          service: selectionRootServiceModel,
          signal: { endpoint: SelectionRootEndpoint, internal: SelectionRootInternal, server: SelectionRootSignal },
        },
        {
          service: selectionAsideServiceModel,
          signal: { endpoint: SelectionAsideEndpoint, internal: SelectionAsideInternal, server: SelectionAsideSignal },
        },
      ],
      scalars: [],
      option: new AkanOption(),
    });
  };

  test("mounts only the named modules and what they inject", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "moduleSelection";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const env = {} satisfies BackendEnv;
    const lifecycle = new DiLifecycle({ env, modules: ["selectionRoot"] }, buildSelectionLib());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionRoot")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionLeaf")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(false);
    expect(lifecycle.disabledModules.get("selectionAside")).toBe('not named by the "modules" option');
  });

  test("mounts every module when the option names none", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "moduleSelection";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const env = {} satisfies BackendEnv;
    const lifecycle = new DiLifecycle({ env }, buildSelectionLib());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(true);
    expect(lifecycle.disabledModules.size).toBe(0);
  });

  test("refuses a module name no lib registered", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "moduleSelection";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    process.env.SERVER_MODE = "all";
    process.env.NODE_ENV = "test";
    const { DiLifecycle } = await import("./diLifecycle");

    const env = {} satisfies BackendEnv;
    expect(() => new DiLifecycle({ env, modules: ["selectionTypo"] }, buildSelectionLib())).toThrow(
      'unknown module "selectionTypo"',
    );
  });
});
