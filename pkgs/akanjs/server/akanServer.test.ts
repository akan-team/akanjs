import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DatabaseSignal } from "../signal/signalRegistry";

const createEnv = (tmp: string) =>
  ({
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

const loadRuntime = async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "serverGet";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  delete process.env.AKAN_OPENAPI;
  delete process.env.AKAN_PUBLIC_OPENAPI;
  process.env.SERVER_MODE = "all";
  process.env.NODE_ENV = "test";
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

  const createLib = (option = new AkanOption()) =>
    new AkanLib("serverGetTest", {
      databases: [
        {
          constant: serverResolverTestConstant,
          database: serverResolverTestDatabase,
          service: serverResolverTestServiceModel,
          signal: new DatabaseSignal(
            ServerResolverTestInternal,
            ServerResolverTestEndpoint,
            ServerResolverTestSlice,
            ServerResolverTestServerSignal,
          ),
        },
      ],
      services: [],
      scalars: [],
      option,
    });

  return {
    SolidPubSub,
    WebsocketAdaptorRole,
    AkanOption,
    AkanServer,
    ServerResolverTestServerSignal,
    ServerResolverTestService,
    createLib,
  };
};

describe("AkanServer DI lookup", () => {
  test("gets service, server signal, and adaptor instances", async () => {
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

describe("AkanServer shutdown", () => {
  test("a second stop() waits for the shutdown already under way instead of returning at once", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-stop-"));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());

    try {
      await server.start({ listen: false });
      const first = server.stop();
      await server.stop();
      expect(server.status).toBe("stopped");
      await first;
    } finally {
      if (server.status === "running") await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer OpenAPI config", () => {
  test("serves OpenAPI only when explicitly enabled", async () => {
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

describe("AkanServer web config", () => {
  test("reads AKAN_SSR / AKAN_CSR and lets setWeb narrow but never widen", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-web-"));
    const make = () => new AkanServer("serverWeb", createEnv(tmp), "all", createLib());

    try {
      expect(make().web).toEqual({ ssr: true, csr: true });
      expect(make().setWeb({ csr: false }).web).toEqual({ ssr: true, csr: false });
      expect(make().setWeb(false).web).toEqual({ ssr: false, csr: false });

      process.env.AKAN_CSR = "false";
      expect(make().web).toEqual({ ssr: true, csr: false });
      expect(make().setWeb(true).web).toEqual({ ssr: true, csr: false });
      expect(make().setWeb({ csr: true }).web).toEqual({ ssr: true, csr: false });

      // A csr-only process has no artifact to serve from, so AKAN_SSR=false drops csr with it.
      process.env.AKAN_SSR = "0";
      delete process.env.AKAN_CSR;
      expect(make().web).toEqual({ ssr: false, csr: false });
      expect(make().setWeb({ csr: true }).web).toEqual({ ssr: false, csr: false });
    } finally {
      delete process.env.AKAN_SSR;
      delete process.env.AKAN_CSR;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer route prefix", () => {
  test("takes the deployed prefix from env and normalizes what code sets", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-prefix-"));
    const make = () => new AkanServer("serverPrefix", createEnv(tmp), "all", createLib());

    try {
      expect([make().prefix, make().websocketPrefix]).toEqual(["/api", "/ws"]);

      process.env.AKAN_API_PREFIX = "backend/";
      process.env.AKAN_WS_PREFIX = "/socket";
      expect([make().prefix, make().websocketPrefix]).toEqual(["/backend", "/socket"]);

      expect(make().setPrefix("v2/api/").prefix).toBe("/v2/api");
      expect(() => make().setPrefix("/")).toThrow('prefix must be a path segment such as "/api"; "/" is not one.');
      expect(() => make().setWebsocketPrefix("  ")).toThrow("websocketPrefix must be a path segment");
    } finally {
      delete process.env.AKAN_API_PREFIX;
      delete process.env.AKAN_WS_PREFIX;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("refuses a prefix a basePath would shadow", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-prefix-clash-"));

    try {
      process.env.AKAN_PUBLIC_BASE_PATHS = "admin,shop";
      const server = new AkanServer("serverPrefixClash", createEnv(tmp), "all", createLib()).setPrefix("/admin");
      await expect(server.init()).rejects.toThrow('Route prefix "/admin" collides with the "admin" basePath');
    } finally {
      delete process.env.AKAN_PUBLIC_BASE_PATHS;
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer MCP config", () => {
  test("is off on an edge server unless the env or the app turns it on", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-edge-"));
    const previous = process.env.AKAN_PUBLIC_OPERATION_MODE;
    try {
      process.env.AKAN_PUBLIC_OPERATION_MODE = "edge";
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).mcp).toBe(false);
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).setMcp(true).mcp).toBe(true);
      process.env.AKAN_MCP = "true";
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).mcp).toBe(true);
    } finally {
      delete process.env.AKAN_MCP;
      if (previous === undefined) delete process.env.AKAN_PUBLIC_OPERATION_MODE;
      else process.env.AKAN_PUBLIC_OPERATION_MODE = previous;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("reads every option from env and lets code override it", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-"));
    const vars = [
      "AKAN_MCP",
      "AKAN_MCP_READONLY",
      "AKAN_MCP_PATH",
      "AKAN_MCP_VERSION",
      "AKAN_MCP_INSTRUCTIONS",
      "AKAN_MCP_ALLOWED_ORIGINS",
      "AKAN_MCP_PAGE_SIZE",
      "AKAN_MCP_LANGUAGE",
      "AKAN_MCP_AUTH_SERVERS",
      "AKAN_MCP_OUTPUT_SCHEMA",
      "AKAN_MCP_RATE_LIMIT",
      "AKAN_MCP_CONCURRENT",
      "AKAN_MCP_PROMPT_BUDGET",
      "AKAN_MCP_APPS",
    ];

    try {
      process.env.AKAN_MCP = "true";
      process.env.AKAN_MCP_READONLY = "true";
      process.env.AKAN_MCP_PATH = "/agent";
      process.env.AKAN_MCP_VERSION = "1.2.3";
      process.env.AKAN_MCP_INSTRUCTIONS = "Domain tools for the test app.";
      process.env.AKAN_MCP_ALLOWED_ORIGINS = "https://a.example.com, https://b.example.com";
      process.env.AKAN_MCP_PAGE_SIZE = "25";
      process.env.AKAN_MCP_LANGUAGE = "ko";
      process.env.AKAN_MCP_AUTH_SERVERS = "https://auth.example.com";
      process.env.AKAN_MCP_OUTPUT_SCHEMA = "none";
      process.env.AKAN_MCP_RATE_LIMIT = "60/30";
      process.env.AKAN_MCP_CONCURRENT = "2";
      process.env.AKAN_MCP_PROMPT_BUDGET = "20000";
      process.env.AKAN_MCP_APPS = "false";

      const fromEnv = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
      expect(fromEnv.mcp).toBe(true);
      expect(fromEnv.mcpReadOnly).toBe(true);
      expect(fromEnv.mcpOption).toEqual({
        path: "/agent",
        version: "1.2.3",
        instructions: "Domain tools for the test app.",
        allowedOrigins: ["https://a.example.com", "https://b.example.com"],
        pageSize: 25,
        language: "ko",
        outputSchema: "none",
        rateLimit: { calls: 60, windowMs: 30_000, concurrent: 2 },
        promptBudget: 20_000,
        apps: false,
      });
      expect(fromEnv.mcpAuth).toEqual({ authorizationServers: ["https://auth.example.com"] });
      process.env.AKAN_MCP_RATE_LIMIT = "off";
      expect(new AkanServer("serverGet", createEnv(tmp), "all", createLib()).mcpOption.rateLimit).toBe(false);
      process.env.AKAN_MCP_RATE_LIMIT = "60/30";

      const overridden = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), {
        mcp: { language: "en", readOnly: false },
      });
      expect(overridden.mcpOption.language).toBe("en");
      expect(overridden.mcpOption.instructions).toBe("Domain tools for the test app.");
      expect(overridden.mcpReadOnly).toBe(false);

      // An explicit `undefined` in code must not erase the env's value.
      const partial = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), {
        mcp: { path: undefined, language: "en", auth: { resource: undefined } },
      });
      expect(partial.mcpOption.path).toBe("/agent");
      expect(partial.mcpOption.language).toBe("en");
      expect(partial.mcpAuth.authorizationServers).toEqual(["https://auth.example.com"]);
    } finally {
      for (const name of vars) delete process.env[name];
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("lets a lib derive its MCP option from the server env, verifier included", async () => {
    const { AkanServer, AkanOption, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-fn-"));
    try {
      const verify = () => ({ sub: "u1" });
      const lib = createLib(
        new AkanOption().setMcp((env) => ({
          instructions: `tools for ${Object.keys(env).length ? "a configured" : "an empty"} env`,
          auth: { authorizationServers: ["https://app.example.com"], verify },
        })),
      );
      const server = new AkanServer("serverGet", createEnv(tmp), "all", lib);
      expect(server.mcpOption.instructions).toBe("tools for a configured env");
      expect(server.mcpAuth.authorizationServers).toEqual(["https://app.example.com"]);
      expect(server.mcpAuth.verify).toBe(verify);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("takes the app's own settings from its option.ts, under an option passed to the constructor", async () => {
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-option-"));
    try {
      process.env.AKAN_MCP_LANGUAGE = "ko";
      process.env.AKAN_MCP_PAGE_SIZE = "25";
      const option = new AkanOption().setMcp({ instructions: "Domain tools for the test app.", language: "en" });

      const fromOption = new AkanServer("serverGet", createEnv(tmp), "all", createLib(option));
      expect(fromOption.mcp).toBe(true);
      expect(fromOption.mcpOption.instructions).toBe("Domain tools for the test app.");
      expect(fromOption.mcpOption.language).toBe("en");
      expect(fromOption.mcpOption.pageSize).toBe(25);

      const overridden = new AkanServer("serverGet", createEnv(tmp), "all", createLib(option), {
        mcp: { language: "ja" },
      });
      expect(overridden.mcpOption.language).toBe("ja");
      expect(overridden.mcpOption.instructions).toBe("Domain tools for the test app.");

      const off = new AkanServer("serverGet", createEnv(tmp), "all", createLib(new AkanOption().setMcp(false)));
      expect(off.mcp).toBe(false);
      expect(off.mcpOption.language).toBe("ko");
    } finally {
      delete process.env.AKAN_MCP_LANGUAGE;
      delete process.env.AKAN_MCP_PAGE_SIZE;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("keeps the surface off under AKAN_MCP=false whatever an option.ts configures", async () => {
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-off-"));
    try {
      process.env.AKAN_MCP = "false";
      const configured = new AkanServer(
        "serverGet",
        createEnv(tmp),
        "all",
        createLib(new AkanOption().setMcp({ instructions: "Domain tools for the test app." })),
      );
      expect(configured.mcp).toBe(false);
      expect(configured.mcpOption.instructions).toBe("Domain tools for the test app.");

      const fromFunction = new AkanServer(
        "serverGet",
        createEnv(tmp),
        "all",
        createLib(new AkanOption().setMcp(() => ({}))),
      );
      expect(fromFunction.mcp).toBe(false);

      const explicit = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), { mcp: { enabled: true } });
      expect(explicit.mcp).toBe(false);
    } finally {
      delete process.env.AKAN_MCP;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("gives the mount path its leading slash and takes the public spelling of both switches", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-path-"));
    const vars = ["AKAN_MCP_PATH", "AKAN_PUBLIC_MCP", "AKAN_PUBLIC_MCP_READONLY"];
    try {
      process.env.AKAN_MCP_PATH = "mcp";
      process.env.AKAN_PUBLIC_MCP = "true";
      process.env.AKAN_PUBLIC_MCP_READONLY = "true";
      const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
      expect(server.mcpOption.path).toBe("/mcp");
      expect(server.mcp).toBe(true);
      expect(server.mcpReadOnly).toBe(true);
    } finally {
      for (const name of vars) delete process.env[name];
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("says in the boot log what the catalogue holds", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-boot-"));
    process.env.AKAN_MCP = "true";
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
    try {
      // Routes on, web off: the report rides with the builtin routes, which a script/console process never mounts.
      await server.init({ web: false });
      const log = lines.join("\n");
      expect(log).toContain("MCP catalogue: tools=4 resourceTemplates=2");
      // The fixture's `[Public]` writes and guardless reads are the two shapes the guard rule refuses.
      expect(log).toContain('did not expose "createServerResolverTestItem"');
      expect(log).toContain('did not expose "updateTitle"');
    } finally {
      stop();
      delete process.env.AKAN_MCP;
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer locale coverage", () => {
  test("names a configured locale the dictionaries never wrote", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const { makeTrans, serviceDictionary } = await import("akanjs/dictionary");
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-locale-"));
    makeTrans({
      localeCoverageTest: {
        dict: serviceDictionary(["en", "ko"] as [string, string]).translate({ ready: ["Ready", "준비됨"] }),
      } as never,
    });
    process.env.AKAN_PUBLIC_LOCALES = "en,ko,zhChs";
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
    try {
      await server.init({ web: false });
      const log = lines.join("\n");
      expect(log).toContain('Locale "zhChs" is configured but');
      expect(log).toContain("localeCoverageTest");
    } finally {
      stop();
      delete process.env.AKAN_PUBLIC_LOCALES;
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer agent relay access", () => {
  test("registers the guard an app declares in its option.ts", async () => {
    const { AgentRelayAccess } = await import("../signal/guards");
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-relay-"));
    class SignedIn {
      static name = "SignedIn";
      static scope = "account" as const;
      canPass(context: { get: (key: string) => unknown }) {
        return !!context.get("account");
      }
    }
    try {
      expect(AgentRelayAccess.hasPolicy).toBe(false);
      expect(await new AgentRelayAccess().canPass({ get: () => ({ id: "u1" }) } as never)).toBe(false);
      const option = new AkanOption().setAgentAccess(SignedIn);
      new AkanServer("serverGet", createEnv(tmp), "all", createLib(option));
      expect(AgentRelayAccess.hasPolicy).toBe(true);

      const guard = new AgentRelayAccess();
      expect(await guard.canPass({ get: () => null } as never)).toBe(false);
      expect(await guard.canPass({ get: () => ({ id: "u1" }) } as never)).toBe(true);
    } finally {
      AgentRelayAccess.use(null);
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer rate limit", () => {
  test("applies the budget an option.ts declares, and AKAN_RATE_LIMIT=off wins over it", async () => {
    const { EndpointRateLimit } = await import("../signal/endpointRateLimit");
    const { buildEndpoint } = await import("../signal/endpointInfo");
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-rate-"));
    const previous = process.env.AKAN_RATE_LIMIT;
    const undeclared = buildEndpoint.query(String).exec(() => "ok");
    const option = () => new AkanOption().setRateLimit({ enabled: true, budget: { calls: 10 } });
    try {
      delete process.env.AKAN_RATE_LIMIT;
      new AkanServer("serverGet", createEnv(tmp), "all", createLib(option()));
      expect(EndpointRateLimit.budgetOf("any", undeclared)).toEqual({ calls: 10, windowMs: 60_000, by: "ip" });

      process.env.AKAN_RATE_LIMIT = "off";
      new AkanServer("serverGet", createEnv(tmp), "all", createLib(option()));
      expect(EndpointRateLimit.budgetOf("any", undeclared)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AKAN_RATE_LIMIT;
      else process.env.AKAN_RATE_LIMIT = previous;
      EndpointRateLimit.reset();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer module exclusion", () => {
  test("takes a module out of the container, from the option or from the env", async () => {
    delete process.env.AKAN_DISABLE_MODULES;
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-disable-"));
    // Options are the last vararg, so an object carrying only `disableModules` has to read as options, not a lib.
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), {
      disableModules: ["serverResolverTestItem"],
    });

    try {
      expect(server.disableModules).toEqual(["serverResolverTestItem"]);
      await server.start({ listen: false });
      expect(() => server.getService("serverResolverTestItem")).toThrow(
        'Service "serverResolverTestItem" is not registered.',
      );

      process.env.AKAN_DISABLE_MODULES = "serverResolverTestItem, base";
      const fromEnv = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
      expect(fromEnv.disableModules).toEqual(["serverResolverTestItem", "base"]);
    } finally {
      delete process.env.AKAN_DISABLE_MODULES;
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("takes out a whole lib, from the option or from the env", async () => {
    delete process.env.AKAN_DISABLE_LIBS;
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-disable-lib-"));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), {
      disableLibs: ["serverGetTest"],
    });

    try {
      expect(server.disableLibs).toEqual(["serverGetTest"]);
      await server.start({ listen: false });
      expect(() => server.getService("serverResolverTestItem")).toThrow(
        'Service "serverResolverTestItem" is not registered.',
      );

      process.env.AKAN_DISABLE_LIBS = "serverGetTest";
      const fromEnv = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
      expect(fromEnv.disableLibs).toEqual(["serverGetTest"]);

      expect(() => new AkanServer("serverGet", createEnv(tmp), "all", createLib(), { disableLibs: ["nope"] })).toThrow(
        '[DI:disableLibs] unknown lib "nope"',
      );
    } finally {
      delete process.env.AKAN_DISABLE_LIBS;
      await server.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("AkanServer console process", () => {
  test("brings services up but runs no internal init, schedule or queue worker", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const fixture = await import("./resolver/resolver.contract.fixture");
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-console-"));
    const replica = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
    const consoleProcess = new AkanServer("serverGet", createEnv(join(tmp, "console")), "all", createLib());

    try {
      fixture.resetResolverOrder();
      await replica.start({ listen: false });
      expect(fixture.resolverOrder).toContain("init");
      await replica.stop();

      fixture.resetResolverOrder();
      const quiet = new AkanServer("serverGet", createEnv(join(tmp, "quiet")), "all", createLib());
      await quiet.start({ listen: false, schedules: false });
      expect(quiet.getService("serverResolverTestItem")).toBeDefined();
      expect(fixture.resolverOrder).not.toContain("init");
      await quiet.stop();

      fixture.resetResolverOrder();
      process.env.AKAN_COMMAND_TYPE = "console";
      await consoleProcess.start({ listen: false, web: false });
      expect(consoleProcess.getService("serverResolverTestItem")).toBeDefined();
      expect(fixture.resolverOrder).not.toContain("init");
    } finally {
      delete process.env.AKAN_COMMAND_TYPE;
      if (replica.status === "running") await replica.stop();
      await consoleProcess.stop();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
