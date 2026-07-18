import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { ServiceModel, SolidPubSub, serve } from "akanjs/service";
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

    const env = {
      repoName: "akan",
      serveDomain: "example.com",
      appName: "serverLifecycle",
      environment: "local",
      operationMode: "local",
      tunnelUsername: "root",
      tunnelPassword: "akan",
    } satisfies BackendEnv;
    const lib = new AkanLib("serverLifecycleTest", {
      databases: [],
      services: [],
      scalars: [],
      option: new AkanOption().applyWebProxy(CustomWebProxy),
    });

    const lifecycle = new DiLifecycle(env, "all", lib);

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
      repoName: "akan",
      serveDomain: "example.com",
      appName: "serverLifecycle",
      environment: "local",
      operationMode: "local",
      tunnelUsername: "root",
      tunnelPassword: "akan",
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
    const lifecycle = new DiLifecycle(env, "all", lib);

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

    const env = {
      repoName: "akan",
      serveDomain: "example.com",
      appName: "serverLifecycle",
      environment: "local",
      operationMode: "local",
      tunnelUsername: "root",
      tunnelPassword: "akan",
    } satisfies BackendEnv;
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
    const lifecycle = new DiLifecycle(env, "all", lib);

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
      repoName: "akan",
      serveDomain: "example.com",
      appName: "serverLifecycle",
      environment: "local",
      operationMode: "local",
      tunnelUsername: "root",
      tunnelPassword: "akan",
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
    const lifecycle = new DiLifecycle(env, "all", lib);

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
