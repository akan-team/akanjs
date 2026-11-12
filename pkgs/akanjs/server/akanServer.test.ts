import { describe, expect, spyOn, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
    { AgentToolsRole, SolidPubSub, WebsocketAdaptorRole },
    { AgentTools },
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
    import("./mcp/AgentTools"),
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
    AgentTools,
    AgentToolsRole,
    SolidPubSub,
    WebsocketAdaptorRole,
    AkanLib,
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
      AgentTools,
      AgentToolsRole,
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
      expect(server.get(AgentToolsRole)).toBeInstanceOf(AgentTools);
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

describe("AkanServer session refresh", () => {
  test("runs the hook a lib's option sets, and none once a server without one is built", async () => {
    const { AkanServer, AkanOption, createLib } = await loadRuntime();
    const { SessionRefresh } = await import("./sessionRefresh");
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-session-refresh-"));
    const asked: string[] = [];
    const page = () => new Request("http://localhost/en/home", { headers: { cookie: "refresh=r1" } });

    try {
      new AkanServer(
        "serverGet",
        createEnv(tmp),
        "all",
        createLib(new AkanOption().setSessionRefresh((request) => [`seen=${asked.push(request.url)}`])),
      );
      expect(await SessionRefresh.apply(page())).toEqual(["seen=1"]);

      new AkanServer("serverGet", createEnv(tmp), "all", createLib());
      expect(await SessionRefresh.apply(page())).toEqual([]);
      expect(asked).toHaveLength(1);
    } finally {
      SessionRefresh.use(null);
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
      expect(log).toContain("MCP catalogue: tools=6 resourceTemplates=3");
      // The fixture's `[Public]` writes are the shape the guard rule refuses.
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

  test("installs the request policy an app declares in its option.ts", async () => {
    const { AgentMeter, AgentRelayPolicy } = await import("akanjs/service");
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-relay-policy-"));
    const sent = { messages: [], tools: [], context: [] };
    try {
      const option = new AkanOption().setAgentRequestPolicy((request) => ({ ...request, instructions: "Scoped." }));
      new AkanServer("serverGet", createEnv(tmp), "all", createLib(option));
      expect((await AgentRelayPolicy.apply(sent, AgentMeter.turnOf(null))).instructions).toBe("Scoped.");
    } finally {
      AgentRelayPolicy.use(null);
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("installs the account resolver an app declares in its option.ts", async () => {
    const { AgentAccounts } = await import("akanjs/service");
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-account-resolver-"));
    try {
      const option = new AkanOption().setAgentAccountResolver((principal) =>
        principal === "u1" ? { id: "u1" } : null,
      );
      new AkanServer("serverGet", createEnv(tmp), "all", createLib(option));
      expect(await AgentAccounts.resolve("u1")).toEqual({ id: "u1" });
      expect(await AgentAccounts.resolve("gone")).toBeNull();
    } finally {
      AgentAccounts.use(null);
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

describe("AkanServer env transform", () => {
  const withSecret = (tmp: string) => ({ ...createEnv(tmp), security: { jwtSecret: "baked" } });
  type SecretEnv = ReturnType<typeof withSecret>;

  test("rewrites the env once, in mount order, before the option readers and without touching the imported env", async () => {
    const { AkanLib, AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-env-"));
    try {
      const imported = withSecret(tmp);
      const order: string[] = [];
      let mcpSaw: string | undefined;
      const shared = new AkanLib("envTransformShared", {
        databases: [],
        services: [],
        scalars: [],
        option: new AkanOption().transformEnv((env) => {
          order.push("shared");
          (env as SecretEnv).security.jwtSecret = "overlaid";
          return env;
        }),
      });
      const app = createLib(
        new AkanOption()
          .transformEnv((env) => {
            order.push("app");
            const { security } = env as SecretEnv;
            return { ...env, security: { jwtSecret: `${security.jwtSecret}+app` } };
          })
          .setMcp((env) => {
            mcpSaw = (env as SecretEnv).security.jwtSecret;
            return true;
          }),
      );

      const server = new AkanServer("serverGet", imported, "all", shared, app);
      expect(order).toEqual(["shared", "app"]);
      expect(mcpSaw).toBe("overlaid+app");
      expect((server.env as SecretEnv).security.jwtSecret).toBe("overlaid+app");
      expect(imported.security.jwtSecret).toBe("baked");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("keeps the env as it was when no option transforms it, and refuses a transform that returns none", async () => {
    const { AkanOption, AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-env-none-"));
    try {
      const imported = withSecret(tmp);
      const server = new AkanServer("serverGet", imported, "all", createLib());
      expect(server.env).not.toBe(imported);
      expect((server.env as SecretEnv).security).toBe(imported.security);

      const forgot = createLib(new AkanOption().transformEnv(() => undefined as never));
      const refusal = (() => {
        try {
          new AkanServer("serverGet", imported, "all", forgot);
        } catch (error) {
          return error;
        }
      })();
      expect(refusal).toMatchObject({
        code: "invalidConfig",
        message: "transformEnv must return the env object, and one returned undefined",
      });
    } finally {
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

const freePort = () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const { port } = probe;
  void probe.stop(true);
  return port as number;
};

const listeningServer = async () => {
  const { AkanServer, createLib } = await loadRuntime();
  const { DiLifecycle } = await import("./di/diLifecycle");
  const tmp = await mkdtemp(join(tmpdir(), "akan-sl-"));
  const port = freePort();
  const runtimeDir = join(tmp, "runtime");
  const vars = { PORT: String(port), AKAN_RUNTIME_DIR: runtimeDir };
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  const events = ["message", "disconnect", "SIGTERM", "SIGINT", "uncaughtException", "unhandledRejection"] as const;
  const listeners = new Map(events.map((event) => [event, process.listeners(event)]));
  Object.assign(process.env, vars);
  const replica = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
  const destroyAll = spyOn(DiLifecycle.prototype, "destroyAll");
  const schedulerInit = spyOn(DiLifecycle.prototype, "runSchedulerInit");
  const restore = async () => {
    if (replica.status === "running") await replica.stop();
    destroyAll.mockRestore();
    schedulerInit.mockRestore();
    for (const [event, before] of listeners)
      for (const listener of process.listeners(event)) if (!before.includes(listener)) process.off(event, listener);
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await rm(tmp, { recursive: true, force: true });
  };
  const served = async () => (await fetch(`http://127.0.0.1:${port}/`).catch(() => null)) !== null;
  return { replica, port, runtimeDir, destroyAll, schedulerInit, served, restore };
};

describe("AkanServer stopped while starting", () => {
  test("a stop during init() tears down before listen, and resolves on the stopped server", async () => {
    const { replica, destroyAll, schedulerInit, served, restore } = await listeningServer();

    try {
      const starting = replica.start({ listen: true, web: false });
      expect(replica.status).toBe("initializing");
      const stopped = replica.stop().then(() => ({ status: replica.status, destroyed: destroyAll.mock.calls.length }));

      expect(await starting).toBe(replica);
      expect(await served()).toBe(false);
      expect(replica.status).toBe("stopped");
      expect(schedulerInit).not.toHaveBeenCalled();
      expect(await stopped).toEqual({ status: "stopped", destroyed: 1 });

      await replica.start({ listen: true, web: false });
      expect(await served()).toBe(true);
    } finally {
      await restore();
    }
  });

  test("a stop() awaited inside an init hook settles, and the start tears down once init returns", async () => {
    const { ServerResolverTestService } = await loadRuntime();
    const { replica, destroyAll, schedulerInit, served, restore } = await listeningServer();
    const settled = Promise.withResolvers<{ status: string; destroyed: number }>();
    const onInit = spyOn(ServerResolverTestService.prototype, "onInit").mockImplementation(async () => {
      await replica.stop();
      settled.resolve({ status: replica.status, destroyed: destroyAll.mock.calls.length });
    });

    try {
      expect(await replica.start({ listen: true, web: false })).toBe(replica);
      expect(await settled.promise).toEqual({ status: "initializing", destroyed: 0 });
      expect(replica.status).toBe("stopped");
      expect(destroyAll).toHaveBeenCalledTimes(1);
      expect(schedulerInit).not.toHaveBeenCalled();
      expect(await served()).toBe(false);

      onInit.mockRestore();
      await replica.start({ listen: true, web: false });
      expect(await served()).toBe(true);
    } finally {
      onInit.mockRestore();
      await restore();
    }
  });

  test("a stop from outside that lands while an init hook runs still waits for the start to tear down", async () => {
    const { ServerResolverTestService } = await loadRuntime();
    const { replica, destroyAll, served, restore } = await listeningServer();
    const hookRunning = Promise.withResolvers<void>();
    const outsideStopped = Promise.withResolvers<void>();
    const hookStopped = Promise.withResolvers<void>();
    const onInit = spyOn(ServerResolverTestService.prototype, "onInit").mockImplementation(async () => {
      hookRunning.resolve();
      await outsideStopped.promise;
      await replica.stop();
      hookStopped.resolve();
    });

    try {
      const starting = replica.start({ listen: true, web: false });
      await hookRunning.promise;
      const outside = replica.stop().then(() => ({ status: replica.status, destroyed: destroyAll.mock.calls.length }));
      outsideStopped.resolve();

      await hookStopped.promise;
      expect(await starting).toBe(replica);
      expect(await outside).toEqual({ status: "stopped", destroyed: 1 });
      expect(await served()).toBe(false);
    } finally {
      onInit.mockRestore();
      await restore();
    }
  });

  test("a stop while listen() opens its log control socket closes it, and serves nothing", async () => {
    const { LogControlSocket } = await import("./logging/logControlSocket");
    const { replica, runtimeDir, destroyAll, schedulerInit, served, restore } = await listeningServer();
    const socketPath = LogControlSocket.pathIn(runtimeDir);
    const openSocket = LogControlSocket.open.bind(LogControlSocket);
    const stopped = Promise.withResolvers<{ status: string; destroyed: number; socket: boolean }>();
    let bound = false;
    //? The mock runs inside the start step, and a stop from a signal or the gateway arrives from outside it.
    const outside = AsyncLocalStorage.snapshot();
    const open = spyOn(LogControlSocket, "open").mockImplementation(async (...args) => {
      expect(replica.status).toBe("starting");
      void outside(() => replica.stop())
        .then(() => ({
          status: replica.status,
          destroyed: destroyAll.mock.calls.length,
          socket: existsSync(socketPath),
        }))
        .then(stopped.resolve, stopped.reject);
      const control = await openSocket(...args);
      bound = control !== null && existsSync(socketPath);
      return control;
    });

    try {
      expect(await replica.start({ listen: true, web: false })).toBe(replica);
      expect(open).toHaveBeenCalledTimes(1);
      expect(bound).toBe(true);
      expect(await served()).toBe(false);
      expect(replica.status).toBe("stopped");
      expect(schedulerInit).not.toHaveBeenCalled();
      expect(await stopped.promise).toEqual({ status: "stopped", destroyed: 1, socket: false });

      open.mockRestore();
      await replica.start({ listen: true, web: false });
      expect(await served()).toBe(true);
      expect(existsSync(socketPath)).toBe(true);
    } finally {
      open.mockRestore();
      await restore();
    }
  });

  test("a stop held through a failed init() leaves the container destroyed once, by the init's own unwind", async () => {
    const { SignalResolver } = await import("./resolver");
    const { replica, destroyAll, served, restore } = await listeningServer();
    const merge = spyOn(SignalResolver, "mergeHttpRoutes").mockImplementation(() => {
      throw new Error("routes refused");
    });

    try {
      const starting = replica.start({ listen: true, web: false });
      const stopped = replica.stop();

      await expect(starting).rejects.toThrow("routes refused");
      await stopped;
      expect(destroyAll).toHaveBeenCalledTimes(1);
      expect(replica.status).toBe("stopped");
      expect(await served()).toBe(false);
    } finally {
      merge.mockRestore();
      await restore();
    }
  });

  test("runs no init schedule once the ready message finds the parent gone", async () => {
    const { LogControlSocket } = await import("./logging/logControlSocket");
    const { OrphanGroup } = await import("./lifecycle/orphanGroup");
    const { replica, schedulerInit, served, restore } = await listeningServer();
    const send = process.send;
    const exited = Promise.withResolvers<number>();
    const exit = spyOn(OrphanGroup, "exit").mockImplementation((code) => exited.resolve(code));
    const open = spyOn(LogControlSocket, "open").mockImplementation(async () => {
      process.send = () => false;
      return null;
    });

    try {
      expect(await replica.start({ listen: true, web: false })).toBe(replica);
      expect(await exited.promise).toBe(0);
      expect(replica.status).toBe("stopped");
      expect(schedulerInit).not.toHaveBeenCalled();
      expect(await served()).toBe(false);
    } finally {
      process.send = send;
      open.mockRestore();
      exit.mockRestore();
      await restore();
    }
  });

  test("runs no init schedule once a stop lands while its log transport starts", async () => {
    const { AkanServer, createLib } = await loadRuntime();
    const { LogControlSocket } = await import("./logging/logControlSocket");
    const { DiLifecycle } = await import("./di/diLifecycle");
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-stop-in-start-"));
    const replica = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
    const listeners = { message: process.listeners("message"), disconnect: process.listeners("disconnect") };
    const schedulerInit = spyOn(DiLifecycle.prototype, "runSchedulerInit");
    const open = spyOn(LogControlSocket, "open").mockImplementation(async () => {
      void replica.stop();
      return null;
    });

    try {
      await replica.start({ listen: false });
      expect(open).toHaveBeenCalledTimes(1);
      expect(replica.status).toBe("stopped");
      expect(schedulerInit).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
      schedulerInit.mockRestore();
      for (const event of ["message", "disconnect"] as const)
        for (const listener of process.listeners(event))
          if (!listeners[event].includes(listener)) process.off(event, listener);
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

//? A server whose IPC channel reads closed stops itself as an orphan, and a dev WebRouter's builder RPC needs one.
const fakeParentIpc = () => {
  const send = process.send;
  const connected = Object.getOwnPropertyDescriptor(process, "connected");
  const sent: unknown[] = [];
  process.send = (message: unknown) => sent.push(message) > 0;
  Object.defineProperty(process, "connected", { configurable: true, get: () => true });
  const restore = () => {
    process.send = send;
    if (connected) Object.defineProperty(process, "connected", connected);
  };
  return { sent, restore };
};

const webServer = async () => {
  const server = await listeningServer();
  const { ROUTE_SEED_INDEX_JSON } = await import("./artifact");
  const { LogControlSocket } = await import("./logging/logControlSocket");
  const { RscWorker } = await import("./rscWorkerHost");
  const { defaultAkanImageConfig } = await import("./types");
  const { WebRouter } = await import("./webRouter");
  const root = await mkdtemp(join(tmpdir(), "akan-web-"));
  const artifactDir = join(root, ".akan", "artifact");
  await mkdir(artifactDir, { recursive: true });
  await Bun.write(
    join(artifactDir, "base-artifact.json"),
    JSON.stringify({
      rscClientUrl: "/_akan/rsc-client.js",
      vendorMap: {},
      pagesBundlePath: join(import.meta.dir, "rscWorkerHead.fixture.tsx"),
      pagesBundleBuildId: 1,
      cssAssets: {},
      domains: [],
      subRoutes: {},
      basePaths: [],
      branches: [],
      imageConfig: defaultAkanImageConfig,
    }),
  );
  const workerPath = process.env.AKAN_RSC_WORKER_PATH;
  process.env.AKAN_RSC_WORKER_PATH = join(import.meta.dir, "rscWorker.tsx");
  const ipc = fakeParentIpc();
  const cwd = spyOn(process, "cwd").mockReturnValue(root);
  const kill = spyOn(RscWorker.prototype, "kill");
  const dispose = spyOn(WebRouter.prototype, "dispose");
  const socketPath = LogControlSocket.pathIn(server.runtimeDir);
  return {
    ...server,
    WebRouter,
    LogControlSocket,
    socketPath,
    start: () => server.replica.start({ listen: true, web: { csr: false } }),
    writeSeedIndex: () => Bun.write(join(artifactDir, ROUTE_SEED_INDEX_JSON), JSON.stringify({ entries: [] })),
    unwound: () => ({
      status: server.replica.status,
      destroyed: server.destroyAll.mock.calls.length,
      routersDisposed: dispose.mock.calls.length,
      workersKilled: kill.mock.calls.length,
      logSocket: existsSync(socketPath),
    }),
    restore: async () => {
      await server.restore();
      ipc.restore();
      cwd.mockRestore();
      kill.mockRestore();
      dispose.mockRestore();
      if (workerPath === undefined) delete process.env.AKAN_RSC_WORKER_PATH;
      else process.env.AKAN_RSC_WORKER_PATH = workerPath;
      await rm(root, { recursive: true, force: true });
    },
  };
};

describe("AkanServer start that fails part way", () => {
  test("a WebRouter.create() that fails after spawning its worker kills it and destroys the container once", async () => {
    const web = await webServer();

    try {
      await expect(web.start()).rejects.toThrow("route-seed-index.json missing");
      expect(web.unwound()).toEqual({
        status: "stopped",
        destroyed: 1,
        routersDisposed: 0,
        workersKilled: 1,
        logSocket: false,
      });

      await web.writeSeedIndex();
      await web.start();
      expect(web.replica.status).toBe("running");
      expect(await web.served()).toBe(true);
    } finally {
      await web.restore();
    }
  }, 30_000);

  test("an initializeRoute() that throws disposes the router and its worker, and destroys the container once", async () => {
    const web = await webServer();
    await web.writeSeedIndex();
    const initializeRoute = spyOn(web.WebRouter.prototype, "initializeRoute").mockImplementationOnce(async () => {
      throw new Error("routes refused");
    });

    try {
      await expect(web.start()).rejects.toThrow("routes refused");
      expect(web.unwound()).toEqual({
        status: "stopped",
        destroyed: 1,
        routersDisposed: 1,
        workersKilled: 1,
        logSocket: false,
      });

      await web.start();
      expect(web.replica.status).toBe("running");
      expect(await web.served()).toBe(true);
    } finally {
      initializeRoute.mockRestore();
      await web.restore();
    }
  }, 30_000);

  test("a listen() that finds its port taken closes the log transport it opened, and serves on a retry", async () => {
    const { isPortInUseError } = await import("./lifecycle/portInUse");
    const web = await webServer();
    await web.writeSeedIndex();
    const openSocket = web.LogControlSocket.open.bind(web.LogControlSocket);
    let bound = false;
    const open = spyOn(web.LogControlSocket, "open").mockImplementation(async (...args) => {
      const control = await openSocket(...args);
      bound = control !== null && existsSync(web.socketPath);
      return control;
    });
    const taken = Bun.serve({ port: web.port, fetch: () => new Response("taken") });

    try {
      expect(isPortInUseError(await web.start().catch((error: unknown) => error))).toBe(true);
      expect(bound).toBe(true);
      expect(web.unwound()).toEqual({
        status: "stopped",
        destroyed: 1,
        routersDisposed: 1,
        workersKilled: 1,
        logSocket: false,
      });

      await taken.stop(true);
      await web.start();
      expect(web.replica.status).toBe("running");
      expect(existsSync(web.socketPath)).toBe(true);
      expect(await (await fetch(`http://127.0.0.1:${web.port}/`)).text()).not.toBe("taken");
    } finally {
      open.mockRestore();
      await taken.stop(true);
      await web.restore();
    }
  }, 30_000);
  test("a stop that lands while initializeRoute() fails resolves on that start's one teardown", async () => {
    const web = await webServer();
    await web.writeSeedIndex();
    const stopped = Promise.withResolvers<void>();
    const initializeRoute = spyOn(web.WebRouter.prototype, "initializeRoute").mockImplementationOnce(async () => {
      void web.replica.stop().then(stopped.resolve, stopped.reject);
      throw new Error("routes refused");
    });

    try {
      await expect(web.start()).rejects.toThrow("routes refused");
      await stopped.promise;
      expect(web.unwound()).toEqual({
        status: "stopped",
        destroyed: 1,
        routersDisposed: 1,
        workersKilled: 1,
        logSocket: false,
      });
    } finally {
      initializeRoute.mockRestore();
      await web.restore();
    }
  }, 30_000);

  test("an init schedule that fails while a stop tears down waits on that teardown instead of starting another", async () => {
    const { replica, destroyAll, schedulerInit, served, restore } = await listeningServer();
    schedulerInit.mockImplementationOnce(async () => {
      void replica.stop();
      throw new Error("schedule refused");
    });

    try {
      await expect(replica.start({ listen: true, web: false })).rejects.toThrow("schedule refused");
      expect(replica.status).toBe("stopped");
      expect(destroyAll).toHaveBeenCalledTimes(1);
      expect(await served()).toBe(false);
    } finally {
      await restore();
    }
  });
  test("a start whose init schedule fails after a stop and the next start leaves that next start running", async () => {
    const { replica, destroyAll, schedulerInit, served, restore } = await listeningServer();
    const reached = Promise.withResolvers<void>();
    const schedule = Promise.withResolvers<void>();
    schedulerInit.mockImplementationOnce(async () => {
      reached.resolve();
      await schedule.promise;
    });

    try {
      const first = replica.start({ listen: true, web: false }).catch((error: unknown) => error);
      await reached.promise;
      await replica.stop();
      const second = replica.start({ listen: true, web: false });
      schedule.reject(new Error("schedule refused"));

      expect(await first).toEqual(new Error("schedule refused"));
      await second;
      expect(replica.status).toBe("running");
      expect(destroyAll).toHaveBeenCalledTimes(1);
      expect(await served()).toBe(true);
    } finally {
      await restore();
    }
  });

  test("a stop() that lands while the unwind tears down waits on that teardown, and the container is destroyed once", async () => {
    const { DiLifecycle } = await import("./di/diLifecycle");
    const { isPortInUseError } = await import("./lifecycle/portInUse");
    const { replica, port, destroyAll, served, restore } = await listeningServer();
    const runSchedulerDestroy = DiLifecycle.prototype.runSchedulerDestroy;
    const destroying = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const schedulerDestroy = spyOn(DiLifecycle.prototype, "runSchedulerDestroy").mockImplementationOnce(async function (
      this: InstanceType<typeof DiLifecycle>,
    ) {
      destroying.resolve();
      await release.promise;
      return await runSchedulerDestroy.call(this);
    });
    const warn = spyOn(replica.logger, "warn");
    const taken = Bun.serve({ port, fetch: () => new Response("taken") });

    try {
      const starting = replica.start({ listen: true, web: false }).catch((error: unknown) => error);
      await destroying.promise;
      const stopping = replica.stop().then(() => replica.status);
      release.resolve();

      expect(isPortInUseError(await starting)).toBe(true);
      expect(await stopping).toBe("stopped");
      expect(warn).not.toHaveBeenCalledWith("AkanServer is not running. Cannot stop.");
      expect(destroyAll).toHaveBeenCalledTimes(1);
      await taken.stop(true);
      expect(await served()).toBe(false);
    } finally {
      schedulerDestroy.mockRestore();
      warn.mockRestore();
      await taken.stop(true);
      await restore();
    }
  });

  test("a listen: false start whose init schedule throws unwinds to stopped with its log socket closed", async () => {
    const { LogControlSocket } = await import("./logging/logControlSocket");
    const { replica, runtimeDir, destroyAll, schedulerInit, restore } = await listeningServer();
    const socketPath = LogControlSocket.pathIn(runtimeDir);
    schedulerInit.mockImplementationOnce(async () => {
      throw new Error("schedule refused");
    });

    try {
      await expect(replica.start({ listen: false })).rejects.toThrow("schedule refused");
      expect({
        status: replica.status,
        destroyed: destroyAll.mock.calls.length,
        socket: existsSync(socketPath),
      }).toEqual({
        status: "stopped",
        destroyed: 1,
        socket: false,
      });

      await replica.start({ listen: false });
      expect(replica.status).toBe("running");
      expect(existsSync(socketPath)).toBe(true);
    } finally {
      await restore();
    }
  });

  test("a stop while a listen: false start opens its log control socket closes it", async () => {
    const { LogControlSocket } = await import("./logging/logControlSocket");
    const { replica, runtimeDir, destroyAll, schedulerInit, restore } = await listeningServer();
    const socketPath = LogControlSocket.pathIn(runtimeDir);
    const openSocket = LogControlSocket.open.bind(LogControlSocket);
    const stopped = Promise.withResolvers<void>();
    let bound = false;
    const open = spyOn(LogControlSocket, "open").mockImplementationOnce(async (...args) => {
      void replica.stop().then(stopped.resolve, stopped.reject);
      const control = await openSocket(...args);
      bound = control !== null && existsSync(socketPath);
      return control;
    });

    try {
      expect(await replica.start({ listen: false })).toBe(replica);
      await stopped.promise;
      expect(bound).toBe(true);
      expect({
        status: replica.status,
        destroyed: destroyAll.mock.calls.length,
        socket: existsSync(socketPath),
      }).toEqual({
        status: "stopped",
        destroyed: 1,
        socket: false,
      });
      expect(schedulerInit).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
      await restore();
    }
  });

  test("a start retried after a failed one answers each health ping once", async () => {
    const { replica, schedulerInit, restore } = await listeningServer();
    const ipc = fakeParentIpc();
    const before = process.listeners("message");
    schedulerInit.mockImplementationOnce(async () => {
      throw new Error("schedule refused");
    });
    const ping = { type: "health.ping", nonce: "retried", sentAt: 0 };

    try {
      await expect(replica.start({ listen: false })).rejects.toThrow("schedule refused");
      await replica.start({ listen: false });
      for (const listener of process.listeners("message")) if (!before.includes(listener)) listener(ping, undefined);
      expect(ipc.sent.filter((message) => (message as { nonce?: string }).nonce === ping.nonce)).toHaveLength(1);
    } finally {
      ipc.restore();
      await restore();
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
