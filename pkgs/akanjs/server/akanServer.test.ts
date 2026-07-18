import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";

const createEnv = (tmp: string) =>
  ({
    repoName: "akan",
    serveDomain: "example.com",
    appName: "serverGet",
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
  }) satisfies BackendEnv & { workspaceRoot: string };

const setAkanEnv = () => {
  process.env.AKAN_PUBLIC_APP_NAME = "serverGet";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  delete process.env.AKAN_OPENAPI;
  delete process.env.AKAN_PUBLIC_OPENAPI;
  process.env.SERVER_MODE = "all";
  process.env.NODE_ENV = "test";
};

const loadRuntime = async () => {
  const [
    { SolidPubSub, WebsocketAdaptorRole },
    { AkanLib },
    { AkanOption },
    { AkanServer },
    {
      ServerResolverTestEndpoint,
      ServerResolverTestInternal,
      ServerResolverTestServerSignal,
      ServerResolverTestService,
      ServerResolverTestSlice,
      serverResolverTestConstant,
      serverResolverTestDatabase,
      serverResolverTestServiceModel,
    },
  ] = await Promise.all([
    import("akanjs/service"),
    import("./akanLib"),
    import("./akanOption"),
    import("./akanServer"),
    import("./resolver/resolver.contract.fixture"),
  ]);

  const createLib = () =>
    new AkanLib("serverGetTest", {
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

  return {
    SolidPubSub,
    WebsocketAdaptorRole,
    AkanServer,
    ServerResolverTestServerSignal,
    ServerResolverTestService,
    createLib,
  };
};

describe("AkanServer DI lookup", () => {
  test("gets service, server signal, and adaptor instances", async () => {
    setAkanEnv();
    const {
      SolidPubSub,
      WebsocketAdaptorRole,
      AkanServer,
      ServerResolverTestServerSignal,
      ServerResolverTestService,
      createLib,
    } = await loadRuntime();

    const tmp = await mkdtemp(join(tmpdir(), "akan-server-get-"));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());

    try {
      await server.start({ listen: false });

      const serviceByClass = server.get(ServerResolverTestService);
      expect(serviceByClass).toBe(server.getService("serverResolverTestItem"));
      expect(server.getService("serverResolverTestItemService")).toBe(serviceByClass);

      const signalByClass = server.get(ServerResolverTestServerSignal);
      expect(server.getSignal("serverResolverTestItem")).toBe(signalByClass);
      expect(server.getSignal("serverResolverTestItemSignal")).toBe(signalByClass);

      const adaptorByClass = server.get(SolidPubSub);
      expect(server.get(WebsocketAdaptorRole)).toBe(adaptorByClass);
      expect(server.getAdaptor("solidPubsub")).toBe(adaptorByClass);
    } finally {
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("throws clear errors before initialization and for missing dependencies", async () => {
    setAkanEnv();
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-get-"));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());

    try {
      expect(() => server.getService("serverResolverTestItem")).toThrow(
        'Service "serverResolverTestItem" is not initialized while AkanServer status is "stopped"',
      );

      await server.start({ listen: false });

      expect(() => server.getService("missing")).toThrow('Service "missing" is not registered.');
      expect(() => server.getSignal("missing")).toThrow('Server signal "missingSignal" is not registered.');
      expect(() => server.getAdaptor("missing")).toThrow('Adaptor "missing" is not registered.');
    } finally {
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer OpenAPI config", () => {
  test("serves OpenAPI only when explicitly enabled", async () => {
    setAkanEnv();
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-openapi-"));

    try {
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).openapi).toBe(false);
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib(), { openapi: true }).openapi).toBe(true);
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).setOpenApi().openapi).toBe(true);

      process.env.AKAN_OPENAPI = "true";
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).openapi).toBe(true);
    } finally {
      delete process.env.AKAN_OPENAPI;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
