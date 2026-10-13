import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BaseEnv, DatabaseModes, resetEnvCache } from "akanjs/base";
import { type ConstantModel, ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into } from "akanjs/document";
import { adapt, type LlmAdaptor, LlmAdaptorRole, ServiceModel, SolidPubSub, serve } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { serverSignal } from "../../signal/serverSignal";
import { DatabaseSignal, ServiceSignal } from "../../signal/signalRegistry";
import { slice } from "../../signal/slice";
import { AkanLib, type AkanLibProps, type DatabaseModule, type ServiceModule } from "../akanLib";
import { AkanOption } from "../akanOption";
import { AkanResponse, HostBasePathWebProxy, LocaleWebProxy, type WebProxy } from "../proxy";
import {
  makeSqliteEnv,
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestModule,
  validId,
} from "../resolver/resolver.contract.fixture";

const loadDiLifecycle = async (appName: string) => {
  process.env.AKAN_PUBLIC_APP_NAME = appName;
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  process.env.SERVER_MODE = "all";
  process.env.NODE_ENV = "test";
  return (await import("./diLifecycle")).DiLifecycle;
};

const libOf = (
  name: string,
  option = new AkanOption(),
  parts: Partial<Pick<AkanLibProps, "databases" | "services">> = {},
) => new AkanLib(name, { databases: [], services: [], scalars: [], option, ...parts });

const serviceModule = (Service: Parameters<typeof ServiceModel.from>[0]): ServiceModule => {
  const service = ServiceModel.from(Service);
  class Endpoint extends endpoint(service, () => ({})) {}
  class Internal extends internal(service, () => ({})) {}
  class Signal extends serverSignal(Endpoint, Internal) {}
  return { service, signal: new ServiceSignal(Internal, Endpoint, Signal) };
};

const RelationTargetInput = via((f) => ({ url: f(String) }));
const RelationTargetObject = via(RelationTargetInput, () => ({}));
const RelationTargetLight = via(RelationTargetObject, ["url"] as const, () => ({}));
const RelationTargetFull = via(RelationTargetObject, RelationTargetLight, () => ({}));
const RelationTargetInsight = via(RelationTargetFull, () => ({}));
const relationTargetConstant = ConstantRegistry.buildModel(
  "diRelationTarget",
  RelationTargetInput,
  RelationTargetObject,
  RelationTargetFull,
  RelationTargetLight,
  RelationTargetInsight,
  { RelationTargetInput, RelationTargetObject, RelationTargetFull, RelationTargetLight, RelationTargetInsight },
);

const RelationHolderInput = via((f) => ({ label: f(String), screenshot: f(RelationTargetFull).optional() }));
const RelationHolderObject = via(RelationHolderInput, () => ({}));
const RelationHolderLight = via(RelationHolderObject, ["label"] as const, () => ({}));
const RelationHolderFull = via(RelationHolderObject, RelationHolderLight, () => ({}));
const RelationHolderInsight = via(RelationHolderFull, () => ({}));
const relationHolderConstant = ConstantRegistry.buildModel(
  "diRelationHolder",
  RelationHolderInput,
  RelationHolderObject,
  RelationHolderFull,
  RelationHolderLight,
  RelationHolderInsight,
  { RelationHolderInput, RelationHolderObject, RelationHolderFull, RelationHolderLight, RelationHolderInsight },
);

const databaseModuleOf = (
  constant: ConstantModel,
  option: { operationMode?: BaseEnv["operationMode"][] } = {},
): DatabaseModule => {
  const { refName, input, full, insight } = constant;
  class Filter extends from(full, () => ({ query: {}, sort: {} })) {}
  class Doc extends by(full) {}
  class Model extends into(Doc, Filter, constant, () => ({})) {}
  const database = DatabaseRegistry.buildModel(
    refName,
    input as unknown as DatabaseCls<InstanceType<typeof input>>,
    Doc,
    Model,
    constant.object,
    insight as unknown as Parameters<typeof DatabaseRegistry.buildModel>[5],
    Filter,
  );
  class Service extends serve(database, option, () => ({})) {}
  const service = ServiceModel.fromModel(Service, constant, database);
  class Internal extends internal(service, () => ({})) {}
  class Endpoint extends endpoint(service, () => ({})) {}
  class Slice extends slice(service, { guards: { root: Public, get: Public, cru: Public } }, () => ({})) {}
  class Signal extends serverSignal(Endpoint, Internal) {}
  return { constant, database, service, signal: new DatabaseSignal(Internal, Endpoint, Slice, Signal) };
};

describe("DiLifecycle declaration-to-runtime contract", () => {
  test("prepends default web proxies before library proxies", async () => {
    const DiLifecycle = await loadDiLifecycle("serverLifecycle");

    class CustomWebProxy implements WebProxy {
      static readonly refName = "CustomWebProxy";
      use() {
        return AkanResponse.next();
      }
    }

    const lib = libOf("serverLifecycleTest", new AkanOption().applyWebProxy(CustomWebProxy));
    const lifecycle = new DiLifecycle({ env: {} }, lib);

    expect(lifecycle.webProxies).toEqual([LocaleWebProxy, HostBasePathWebProxy, CustomWebProxy]);
  });

  test("assembles AkanLib declarations into registry, live services, and routes", async () => {
    const DiLifecycle = await loadDiLifecycle("serverLifecycle");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-"));
    const lib = libOf("serverLifecycleTest", new AkanOption(), { databases: [serverResolverTestModule()] });
    const lifecycle = new DiLifecycle({ env: makeSqliteEnv(tmp) }, lib);

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

      const service = lifecycle.live.service.get("serverResolverTestItem") as unknown as {
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
    const DiLifecycle = await loadDiLifecycle("serverLifecycle");

    class LocalBuildService extends serve("localBuild" as const, { enabled: false }, () => ({})) {}
    const localBuildServiceModel = ServiceModel.from(LocalBuildService);
    class LocalBuildEndpoint extends endpoint(localBuildServiceModel, () => ({})) {}
    class LocalBuildInternal extends internal(localBuildServiceModel, () => ({})) {}
    class LocalBuildSignal extends serverSignal(LocalBuildEndpoint, LocalBuildInternal) {}

    class ProjectBuildService extends serve("projectBuild" as const, ({ signal }) => ({
      localBuildSignal: signal<InstanceType<typeof LocalBuildSignal>>(),
    })) {}

    const lib = libOf("serverLifecycleTest", new AkanOption(), {
      services: [
        {
          service: localBuildServiceModel,
          signal: new ServiceSignal(LocalBuildInternal, LocalBuildEndpoint, LocalBuildSignal),
        },
        serviceModule(ProjectBuildService),
      ],
    });
    const lifecycle = new DiLifecycle({ env: {} }, lib);

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("localBuild")).toBe(false);
    expect(lifecycle.registry.serverSignalCls.has("localBuildSignal")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("projectBuild")).toBe(false);
    expect(lifecycle.registry.serverSignalCls.has("projectBuildSignal")).toBe(false);
    expect(lifecycle.live.service.has("localBuild")).toBe(false);
    expect(lifecycle.live.service.has("projectBuild")).toBe(false);
  });

  test("skips disabled database modules before document, service, and signal registration", async () => {
    const DiLifecycle = await loadDiLifecycle("serverLifecycle");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-disabled-"));
    class DisabledServerResolverTestService extends serve(serverResolverTestDatabase, { enabled: false }, () => ({})) {}
    const disabledServiceModel = ServiceModel.fromModel(
      DisabledServerResolverTestService,
      serverResolverTestConstant,
      serverResolverTestDatabase,
    );
    const lib = libOf("serverLifecycleTest", new AkanOption(), {
      databases: [serverResolverTestModule(disabledServiceModel)],
    });
    const lifecycle = new DiLifecycle({ env: makeSqliteEnv(tmp) }, lib);

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
    const DiLifecycle = await loadDiLifecycle("adaptorOverride");

    class FakeLlm extends adapt("fakeLlm" as const, () => ({})) implements LlmAdaptor {
      async chat() {
        return { text: "faked", stop: "end" as const };
      }
    }

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-di-"));
    const lib = libOf("llmOverrideTest", new AkanOption().applyAdaptor(LlmAdaptorRole, FakeLlm));
    const lifecycle = new DiLifecycle({ env: makeSqliteEnv(tmp) }, lib);
    try {
      await lifecycle.initializeAll();
      expect(lifecycle.registry.adaptorRole.get(LlmAdaptorRole)).toBe(FakeLlm);
      const agentService = lifecycle.live.service.get("agent") as unknown as {
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
    const DiLifecycle = await loadDiLifecycle("llmOption");

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-llm-"));
    const env = { hostname: "llmOption", ...makeSqliteEnv(tmp) };
    const dependency = libOf(
      "llmLibTest",
      new AkanOption().setLlm({ model: "lib-model", host: "https://lib.example.com" }),
    );
    const app = libOf(
      "llmAppTest",
      new AkanOption().setLlm((options) => ({ apiKey: `key-${options.hostname}`, model: "app-model" })),
    );
    const lifecycle = new DiLifecycle({ env }, dependency, app);
    try {
      await lifecycle.initializeAll();
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
    const DiLifecycle = await loadDiLifecycle("duplicateUse");

    const makeLib = (name: string) => libOf(name, new AkanOption().use({ duplicateUseApi: { name } }));
    const lifecycle = new DiLifecycle({ env: {} }, makeLib("duplicateUseA"), makeLib("duplicateUseB"));

    await expect(lifecycle.initializeAll()).rejects.toThrow(
      '"duplicateUseApi" is registered by lib "duplicateUseA" and by lib "duplicateUseB"',
    );
  });

  test("refuses two adaptor classes claiming one refName", async () => {
    const DiLifecycle = await loadDiLifecycle("duplicateAdaptor");

    class FirstRival extends adapt("duplicateRival" as const, () => ({})) {}
    class SecondRival extends adapt("duplicateRival" as const, () => ({})) {}
    class DuplicateAlphaService extends serve("duplicateAlpha" as const, ({ plug }) => ({
      rival: plug(FirstRival),
    })) {}
    class DuplicateBetaService extends serve("duplicateBeta" as const, ({ plug }) => ({
      rival: plug(SecondRival),
    })) {}

    const lib = libOf("duplicateAdaptorTest", new AkanOption(), {
      services: [serviceModule(DuplicateAlphaService), serviceModule(DuplicateBetaService)],
    });

    expect(() => new DiLifecycle({ env: {} }, lib)).toThrow(
      '"duplicateRival" is registered by service "duplicateAlpha" and by service "duplicateBeta"',
    );
  });
});

describe("DiLifecycle module selection", () => {
  const buildSelectionLib = () => {
    class SelectionLeafService extends serve("selectionLeaf" as const, () => ({})) {}
    class SelectionRootService extends serve("selectionRoot" as const, ({ service }) => ({
      selectionLeafService: service<InstanceType<typeof SelectionLeafService>>(),
    })) {}
    class SelectionAsideService extends serve("selectionAside" as const, () => ({})) {}
    return libOf("moduleSelectionTest", new AkanOption(), {
      services: [
        serviceModule(SelectionLeafService),
        serviceModule(SelectionRootService),
        serviceModule(SelectionAsideService),
      ],
    });
  };

  const buildExclusionLibs = () => {
    class ExclusionExtraService extends serve("exclusionExtra" as const, () => ({})) {}
    class ExclusionKeeperService extends serve("exclusionKeeper" as const, () => ({})) {}
    class ExclusionDependentService extends serve("exclusionDependent" as const, ({ service }) => ({
      exclusionExtraService: service<InstanceType<typeof ExclusionExtraService>>(),
    })) {}
    const extraLib = libOf("exclusionExtraTest", new AkanOption(), {
      services: [serviceModule(ExclusionExtraService)],
    });
    const coreLib = libOf("exclusionCoreTest", new AkanOption(), {
      services: [serviceModule(ExclusionKeeperService), serviceModule(ExclusionDependentService)],
    });
    return [extraLib, coreLib];
  };

  test("mounts only the named modules and what they inject", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    const lifecycle = new DiLifecycle({ env: {}, modules: ["selectionRoot"] }, buildSelectionLib());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionRoot")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionLeaf")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(false);
    expect(lifecycle.disabledModules.get("selectionAside")).toBe('not named by the "modules" option');
  });

  test("mounts every module when the option names none", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    const lifecycle = new DiLifecycle({ env: {} }, buildSelectionLib());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(true);
    expect(lifecycle.disabledModules.size).toBe(0);
  });

  test("refuses a module name no lib registered", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    expect(() => new DiLifecycle({ env: {}, modules: ["selectionTypo"] }, buildSelectionLib())).toThrow(
      'unknown module "selectionTypo"',
    );
  });

  test("drops a disabled module and everything that reaches it", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    const lifecycle = new DiLifecycle({ env: {}, disableModules: ["selectionLeaf"] }, buildSelectionLib());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionLeaf")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("selectionRoot")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(true);
    expect(lifecycle.disabledModules.get("selectionLeaf")).toBe('named by the "disableModules" option');
    expect(lifecycle.disabledModules.get("selectionRoot")).toBe('depends on disabled module "selectionLeaf"');
  });

  test('takes a module off even when "modules" named it', async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    const lifecycle = new DiLifecycle(
      { env: {}, modules: ["selectionRoot", "selectionAside"], disableModules: ["selectionAside"] },
      buildSelectionLib(),
    );

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("selectionRoot")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionLeaf")).toBe(true);
    expect(lifecycle.registry.serviceCls.has("selectionAside")).toBe(false);
    expect(lifecycle.disabledModules.get("selectionAside")).toBe('named by the "disableModules" option');
  });

  test("drops every module the disabled lib registered, and what reaches them", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    const lifecycle = new DiLifecycle({ env: {}, disableLibs: ["exclusionExtraTest"] }, ...buildExclusionLibs());

    await expect(lifecycle.initializeAll()).resolves.toBeDefined();
    expect(lifecycle.registry.serviceCls.has("exclusionExtra")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("exclusionDependent")).toBe(false);
    expect(lifecycle.registry.serviceCls.has("exclusionKeeper")).toBe(true);
    expect(lifecycle.disabledModules.get("exclusionExtra")).toBe(
      'in lib "exclusionExtraTest", named by the "disableLibs" option',
    );
    expect(lifecycle.disabledModules.get("exclusionDependent")).toBe('depends on disabled module "exclusionExtra"');
  });

  test("refuses a lib name nothing mounted", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    expect(() => new DiLifecycle({ env: {}, disableLibs: ["exclusionTypo"] }, ...buildExclusionLibs())).toThrow(
      '[DI:disableLibs] unknown lib "exclusionTypo"',
    );
  });

  const buildModeLib = () => {
    class ModeLeafService extends serve("modeLeaf" as const, () => ({})) {}
    class ModeEdgeService extends serve("modeEdge" as const, { operationMode: ["edge"] }, ({ service }) => ({
      modeLeafService: service<InstanceType<typeof ModeLeafService>>(),
    })) {}
    class ModeCloudService extends serve("modeCloud" as const, () => ({})) {}
    return libOf("operationModeTest", new AkanOption(), {
      services: [serviceModule(ModeLeafService), serviceModule(ModeEdgeService), serviceModule(ModeCloudService)],
    });
  };

  const inOperationMode = async <T>(mode: string, run: () => Promise<T>) => {
    process.env.AKAN_PUBLIC_OPERATION_MODE = mode;
    resetEnvCache();
    try {
      return await run();
    } finally {
      process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
      resetEnvCache();
    }
  };

  test("keeps a module out of an operation mode its serve() does not list", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    await inOperationMode("cloud", async () => {
      const lifecycle = new DiLifecycle({ env: {} }, buildModeLib());
      await expect(lifecycle.initializeAll()).resolves.toBeDefined();
      expect(lifecycle.registry.serviceCls.has("modeEdge")).toBe(false);
      expect(lifecycle.registry.serviceCls.has("modeCloud")).toBe(true);
      expect(lifecycle.disabledModules.get("modeEdge")).toBe('operationMode "cloud" is not in [edge]');
    });
  });

  test('"@edge" mounts every module that lists edge, and what they inject', async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    await inOperationMode("edge", async () => {
      const lifecycle = new DiLifecycle({ env: {}, modules: ["@edge"] }, buildModeLib());
      await expect(lifecycle.initializeAll()).resolves.toBeDefined();
      expect(lifecycle.registry.serviceCls.has("modeEdge")).toBe(true);
      expect(lifecycle.registry.serviceCls.has("modeLeaf")).toBe(true);
      expect(lifecycle.registry.serviceCls.has("modeCloud")).toBe(false);
    });
  });

  test("refuses a selector no serve() lists", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    expect(() => new DiLifecycle({ env: {}, modules: ["@kiosk"] }, buildModeLib())).toThrow(
      '[DI:modules] "@kiosk" names no module',
    );
  });

  test("drops a module whose relation target its operation mode keeps out, and mounts it where the target runs", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");
    const lib = libOf("relationModeTest", new AkanOption(), {
      databases: [
        databaseModuleOf(relationTargetConstant, { operationMode: ["edge"] }),
        databaseModuleOf(relationHolderConstant),
      ],
    });

    await inOperationMode("cloud", async () => {
      const lifecycle = new DiLifecycle({ env: {} }, lib);
      expect(lifecycle.modules.database.has("diRelationHolder")).toBe(false);
      expect(lifecycle.disabledModules.get("diRelationHolder")).toBe('relates to disabled module "diRelationTarget"');
    });
    await inOperationMode("edge", async () => {
      const lifecycle = new DiLifecycle({ env: {} }, lib);
      expect(lifecycle.modules.database.has("diRelationHolder")).toBe(true);
      expect(lifecycle.modules.database.has("diRelationTarget")).toBe(true);
    });
  });

  test("refuses a disabled module name no lib registered", async () => {
    const DiLifecycle = await loadDiLifecycle("moduleSelection");

    expect(() => new DiLifecycle({ env: {}, disableModules: ["selectionTypo"] }, buildSelectionLib())).toThrow(
      '[DI:disableModules] unknown module "selectionTypo"',
    );
  });
});

// Ids are from `local/database-modes/05-mode-config.md`.
describe("DiLifecycle database mode", () => {
  const bootIn = async (env: Record<string, string | undefined>) => {
    const keys = ["AKAN_PUBLIC_ENV", "AKAN_PUBLIC_OPERATION_MODE", "AKAN_DATABASE_MODE", "AKAN_DATABASE_MODES"];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.AKAN_PUBLIC_APP_NAME = "serverLifecycle";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const { resetEnvCache, getEnv } = await import("akanjs/base");
    resetEnvCache();
    try {
      const { DiLifecycle } = await import("./diLifecycle");
      new DiLifecycle({ env: {} }, libOf("databaseModeTest"));
      return getEnv().databaseMode;
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetEnvCache();
    }
  };
  const deployed = { AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_OPERATION_MODE: "cloud" };

  test("[CFG-1] boots a build's only mode without being told, and refuses to guess between several", async () => {
    expect(await bootIn({ ...deployed, AKAN_DATABASE_MODE: undefined, AKAN_DATABASE_MODES: "cluster" })).toBe(
      "cluster",
    );
    await expect(
      bootIn({ ...deployed, AKAN_DATABASE_MODE: undefined, AKAN_DATABASE_MODES: "single,cluster" }),
    ).rejects.toThrow("AKAN_DATABASE_MODE names neither");
  });

  test("[CFG-2] refuses a mode whose drivers the build does not carry, naming them", async () => {
    const drivers = DatabaseModes.drivers as { cluster: readonly string[] };
    const carried = drivers.cluster;
    drivers.cluster = [...carried, "akan-driver-that-is-not-installed"];
    try {
      await expect(
        bootIn({ ...deployed, AKAN_DATABASE_MODE: "cluster", AKAN_DATABASE_MODES: undefined }),
      ).rejects.toThrow("imports akan-driver-that-is-not-installed, which this build does not carry");
    } finally {
      drivers.cluster = carried;
    }
  });
});
