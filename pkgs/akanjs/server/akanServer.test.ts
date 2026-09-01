import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { Logger } from "akanjs/common";

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

  const createLib = (option = new AkanOption()) =>
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

describe("AkanServer web config", () => {
  test("reads AKAN_SSR / AKAN_CSR and lets setWeb narrow but never widen", async () => {
    setAkanEnv();
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-web-"));
    const make = () => new AkanServer("serverWeb", createEnv(tmp), "all", createLib());

    try {
      expect(make().web).toEqual({ ssr: true, csr: true });
      expect(make().setWeb({ csr: false }).web).toEqual({ ssr: true, csr: false });
      expect(make().setWeb(false).web).toEqual({ ssr: false, csr: false });

      process.env.AKAN_CSR = "false";
      expect(make().web).toEqual({ ssr: true, csr: false });
      // Narrowing only: `setWeb` cannot put back what the env took away.
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

describe("AkanServer MCP config", () => {
  test("reads every option from env and lets code override it", async () => {
    setAkanEnv();
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
    ];

    try {
      // A child of the gateway is handed nothing but its environment, so every field has an env spelling for a
      // deployment to reach — what an app writes in `option.ts` merges over these.
      process.env.AKAN_MCP = "true";
      process.env.AKAN_MCP_READONLY = "true";
      process.env.AKAN_MCP_PATH = "/agent";
      process.env.AKAN_MCP_VERSION = "1.2.3";
      process.env.AKAN_MCP_INSTRUCTIONS = "Domain tools for the test app.";
      process.env.AKAN_MCP_ALLOWED_ORIGINS = "https://a.example.com, https://b.example.com";
      process.env.AKAN_MCP_PAGE_SIZE = "25";
      process.env.AKAN_MCP_LANGUAGE = "ko";
      process.env.AKAN_MCP_AUTH_SERVERS = "https://auth.example.com";

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
      });
      expect(fromEnv.mcpAuth).toEqual({ authorizationServers: ["https://auth.example.com"] });

      const overridden = new AkanServer("serverGet", createEnv(tmp), "all", createLib(), {
        mcp: { language: "en", readOnly: false },
      });
      expect(overridden.mcpOption.language).toBe("en");
      expect(overridden.mcpOption.instructions).toBe("Domain tools for the test app.");
      expect(overridden.mcpReadOnly).toBe(false);

      // "Code wins over the env of the same name" is about a value, not about a key being present: a caller
      // assembling options conditionally passes `undefined`, which a spread would read as a value and erase.
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

  test("takes the app's own settings from its option.ts, under an option passed to the constructor", async () => {
    setAkanEnv();
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

      // A boolean carries no fields, so turning the surface off leaves what the option and the env already said.
      const off = new AkanServer("serverGet", createEnv(tmp), "all", createLib(new AkanOption().setMcp(false)));
      expect(off.mcp).toBe(false);
      expect(off.mcpOption.language).toBe("ko");
    } finally {
      delete process.env.AKAN_MCP_LANGUAGE;
      delete process.env.AKAN_MCP_PAGE_SIZE;
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("gives the mount path its leading slash and takes the public spelling of both switches", async () => {
    setAkanEnv();
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-path-"));
    const vars = ["AKAN_MCP_PATH", "AKAN_PUBLIC_MCP", "AKAN_PUBLIC_MCP_READONLY"];
    try {
      // Route key and OAuth metadata path are both built by concatenation, so a bare `mcp` published its metadata
      // at `/.well-known/oauth-protected-resourcemcp` — a URL no client would ever look for.
      process.env.AKAN_MCP_PATH = "mcp";
      // The pairing `AKAN_OPENAPI` already has: a value carried under the public prefix need not be spelled twice.
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
    setAkanEnv();
    const { AkanServer, createLib } = await loadRuntime();
    const tmp = await mkdtemp(join(tmpdir(), "akan-server-mcp-boot-"));
    process.env.AKAN_MCP = "true";
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => lines.push(message));
    const server = new AkanServer("serverGet", createEnv(tmp), "all", createLib());
    try {
      // Routes on, web off: the report rides with the builtin routes, so a `script`/`console` command that mounts
      // none stays quiet about a catalogue it is not serving.
      await server.init({ web: false });
      const log = lines.join("\n");
      expect(log).toContain("MCP catalogue: tools=5 prompts=0 resourceTemplates=3");
      // Nobody wrote an opt-in, so the boot log is the only place a missing tool has an explanation — and this
      // fixture's `[Public]` writes and guardless reads are exactly the two shapes the guarded rule keeps out.
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

describe("AkanServer agent relay access", () => {
  test("registers the guard an app declares in its option.ts", async () => {
    setAkanEnv();
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
