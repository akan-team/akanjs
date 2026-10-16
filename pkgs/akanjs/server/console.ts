import type { BaseEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { Adaptor, Service } from "akanjs/service";
import type { ServerSignal } from "akanjs/signal";
import type { AkanServer } from "./akanServer";
import { type AkanConsoleCommand, AkanConsoleSession } from "./consoleSession";
import { resolveRuntimeDir } from "./lifecycle/runtimeDir";
import { LogControlUnavailableError, LogTailClient } from "./logging/logTailClient";

export { evaluateAkanConsoleInput, isAkanConsoleInputComplete } from "./consoleSession";

export interface AkanConsoleOptions {
  prompt?: string;
  globals?: Record<string, unknown>;
  input?: typeof process.stdin;
  output?: typeof process.stdout;
  /** Where the running server keeps `akan-control.sock`; the console is its own process and has to be told. */
  runtimeDir?: string;
}

/** `level=warn grep="payment failed" endpoint=mutation:*` → a query object the socket parses. */
export const parseAkanConsoleQuery = (args: string): Record<string, string> => {
  const query: Record<string, string> = {};
  for (const match of args.matchAll(/(?<![A-Za-z])([A-Za-z]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    const [, key, doubleQuoted, singleQuoted, bare] = match;
    if (key) query[key] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return query;
};

/** Attaches to the running server's control socket, not the console's own `listen: false` server. */
export const createAkanConsoleLogCommands = (
  appName: string,
  runtimeDir: string,
): Record<string, AkanConsoleCommand> => {
  const socketPath = LogTailClient.socketPath(runtimeDir);
  let tail: { client: LogTailClient; id: string; summary: string } | null = null;
  const connect = async (
    session: AkanConsoleSession,
    onRecord: (record: Parameters<typeof Logger.render>[0]) => void,
  ) => {
    try {
      return await LogTailClient.connect(socketPath, {
        onRecord: (entry) => onRecord(entry.record),
        onEvent: (response) => {
          if (response.type === "dropped") session.write(`tail: ${response.count} records dropped (slow reader)\n`);
        },
        onClose: () => {
          if (tail) session.write("tail: connection closed\n");
          tail = null;
        },
      });
    } catch (error) {
      if (error instanceof LogControlUnavailableError) {
        session.write(`${appName} is not running (no akan-control.sock in ${runtimeDir})\n`);
        return null;
      }
      throw error;
    }
  };
  const stopTail = () => {
    const current = tail;
    tail = null;
    current?.client.close();
  };
  return {
    ".tail": {
      desc: "Follow the running server: .tail level=warn grep=payment endpoint=mutation:* | .tail off",
      run: async (args, session) => {
        if (args === "off") {
          if (!tail) session.write("tail: not running\n");
          stopTail();
          return;
        }
        if (!args) {
          session.write(tail ? `tail: following ${tail.summary}\n` : "tail: not running; try .tail level=warn\n");
          return;
        }
        stopTail();
        const client = await connect(session, (record) => session.write(Logger.render(record)));
        if (!client) return;
        const query = parseAkanConsoleQuery(args);
        const subscribed = await client.subscribe(query);
        tail = { client, id: subscribed.id, summary: args };
        session.onClose(stopTail);
        session.write(`tail: following ${args} (${LogTailClient.describeCoverage(subscribed.coverage)})\n`);
        if (query.endpoint)
          session.write("tail: primitive query fast-path requests carry no endpoint and are not shown\n");
      },
    },
    ".trace": {
      desc: "Print every buffered record of one request: .trace <traceId>",
      run: async (args, session) => {
        if (!args) {
          session.write("usage: .trace <traceId>\n");
          return;
        }
        const client = await connect(session, () => undefined);
        if (!client) return;
        try {
          const { entries, coverage } = await client.history({ trace: args });
          if (!entries.length)
            session.write(`no records for trace ${args} (${LogTailClient.describeCoverage(coverage)})\n`);
          for (const entry of entries) session.write(Logger.render(entry.record));
        } finally {
          client.close();
        }
      },
    },
  };
};

export interface AkanConsoleContext extends Record<string, unknown> {
  server: AkanServer;
  env: AkanServer["env"];
  get: AkanServer["get"];
  service: <T = Service>(refName: string) => T;
  signal: <T = ServerSignal>(refName: string) => T;
  adaptor: <T = Adaptor>(refName: string) => T;
  methods: (value: unknown) => string[];
  debug: () => ReturnType<AkanServer["inspectConsole"]>;
}

export const assertAkanConsoleAllowed = (env: Partial<Pick<BaseEnv, "environment" | "operationMode">> = {}) => {
  const environment = env.environment ?? ((process.env.AKAN_PUBLIC_ENV ?? "debug") as BaseEnv["environment"]);
  const operationMode =
    env.operationMode ??
    ((process.env.AKAN_PUBLIC_OPERATION_MODE ??
      (environment === "local" ? "local" : "cloud")) as BaseEnv["operationMode"]);
  const isProductionLike =
    environment === "main" ||
    operationMode === "cloud" ||
    operationMode === "edge" ||
    process.env.NODE_ENV === "production";
  if (!isProductionLike || process.env.AKAN_CONSOLE === "1") return;

  throw new Error(
    [
      "Akan console is disabled for production-like environments.",
      "Run with AKAN_CONSOLE=1 only for the exec command that opens the console.",
      "Example: AKAN_CONSOLE=1 bun console.js",
    ].join("\n"),
  );
};

export const getAkanConsoleMethods = (value: unknown): string[] => {
  const names = new Set<string>();
  let proto =
    typeof value === "function"
      ? value.prototype
      : value && (typeof value === "object" || typeof value === "function")
        ? Object.getPrototypeOf(value)
        : null;

  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor?.value === "function") names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
};

export const createAkanConsoleContext = (
  server: AkanServer,
  globals: Record<string, unknown> = {},
): AkanConsoleContext => {
  return {
    server,
    env: server.env,
    get: server.get.bind(server) as AkanServer["get"],
    service: server.getService.bind(server),
    signal: server.getSignal.bind(server),
    adaptor: server.getAdaptor.bind(server),
    methods: getAkanConsoleMethods,
    debug: () => server.inspectConsole(),
    ...globals,
  };
};

export const startAkanConsole = async (server: AkanServer, options: AkanConsoleOptions = {}) => {
  const session = new AkanConsoleSession({
    context: createAkanConsoleContext(server, options.globals),
    prompt: options.prompt ?? `akan:${server.name}> `,
    banner: `Akan console started for ${server.name}. Type .help for commands.\n`,
    input: options.input,
    output: options.output,
    commands: createAkanConsoleLogCommands(server.name, options.runtimeDir ?? resolveRuntimeDir()),
  });
  await session.run();
};
