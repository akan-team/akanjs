import { createInterface } from "node:readline/promises";
import { inspect } from "node:util";
import type { BaseEnv } from "akanjs/base";
import type { Adaptor, Service } from "akanjs/service";
import type { ServerSignal } from "akanjs/signal";
import type { AkanServer } from "./akanServer";

type AsyncFunctionConstructor = new (...args: string[]) => (scope: object) => Promise<unknown>;

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as AsyncFunctionConstructor;

export interface AkanConsoleOptions {
  prompt?: string;
  globals?: Record<string, unknown>;
  input?: typeof process.stdin;
  output?: typeof process.stdout;
}

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

export const assertAkanConsoleAllowed = (
  env: Pick<BaseEnv, "environment" | "operationMode"> = {
    environment: (process.env.AKAN_PUBLIC_ENV ?? "debug") as BaseEnv["environment"],
    operationMode: (process.env.AKAN_PUBLIC_OPERATION_MODE ?? "cloud") as BaseEnv["operationMode"],
  },
) => {
  const isProductionLike =
    env.environment === "main" ||
    env.operationMode === "cloud" ||
    env.operationMode === "edge" ||
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
  const context = {
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
  return context;
};

const createScope = (context: Record<string, unknown>) =>
  new Proxy(context, {
    has: () => true,
    get(target, prop) {
      if (prop === Symbol.unscopables) return undefined;
      if (prop in target) return target[prop as keyof typeof target];
      return (globalThis as Record<PropertyKey, unknown>)[prop];
    },
    set(target, prop, value) {
      target[prop as keyof typeof target] = value;
      return true;
    },
  });

export const evaluateAkanConsoleInput = async (source: string, context: Record<string, unknown>) => {
  const trimmed = source.trim();
  if (!trimmed) return undefined;
  const scope = createScope(context);

  try {
    return await new AsyncFunction("scope", `with (scope) { return await (${trimmed}); }`)(scope);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return await new AsyncFunction("scope", `with (scope) { return await (async () => {\n${trimmed}\n})(); }`)(scope);
  }
};

const printHelp = (output: typeof process.stdout) => {
  output.write(
    [
      "Akan console commands:",
      "  .help       Show this help",
      "  .globals    Show available global names",
      "  .exit       Close the console",
      "",
      "Examples:",
      "  debug()",
      '  methods(service("user"))',
      '  await service("user").__count()',
      '  userService = service("user")',
      "",
    ].join("\n"),
  );
};

const formatValue = (value: unknown) => {
  if (value === undefined) return "";
  return `${inspect(value, { colors: true, depth: 5, maxArrayLength: 100 })}\n`;
};

export const startAkanConsole = async (server: AkanServer, options: AkanConsoleOptions = {}) => {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const context = createAkanConsoleContext(server, options.globals);
  const prompt = options.prompt ?? `akan:${server.name}> `;
  const rl = createInterface({ input, output, terminal: true });

  output.write(`Akan console started for ${server.name}. Type .help for commands.\n`);
  rl.setPrompt(prompt);
  rl.prompt();

  rl.on("SIGINT", () => {
    output.write("\n");
    rl.close();
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    try {
      if (!trimmed) {
        rl.prompt();
        continue;
      }
      if (trimmed === ".exit" || trimmed === ".quit") {
        rl.close();
        break;
      }
      if (trimmed === ".help") {
        printHelp(output);
        rl.prompt();
        continue;
      }
      if (trimmed === ".globals") {
        output.write(
          `${Object.keys(context)
            .sort((a, b) => a.localeCompare(b))
            .join(", ")}\n`,
        );
        rl.prompt();
        continue;
      }

      output.write(formatValue(await evaluateAkanConsoleInput(line, context)));
    } catch (error) {
      output.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    }
    rl.prompt();
  }
};
