import { dayjs, enumOf, Float, ID, Int } from "akanjs/base";
import { Logger, type LoggerSinkEntry, MCP_FAILURE_META } from "akanjs/common";
import { ConstantRegistry, via } from "akanjs/constant";
import { getDefaultInjectRegistry, getDefaultLiveRegistry, ServiceModel, serve } from "akanjs/service";
import { endpoint } from "../signal/endpoint";
import type { Guard, GuardScope } from "../signal/guard";
import { SignalFailure } from "../signal/SignalFailure";
import { McpRouter } from "./mcp/McpRouter";
import { SignalResolver } from "./resolver/signal.resolver";
import { ApiRouter } from "./routing/apiRouter";

class AdversarialProbeService extends serve("adversarialProbe" as const, () => ({})) {}

export class AdversarialProbeStatus extends enumOf("adversarialProbeStatus", ["draft", "active"] as const) {}

const AdversarialProbePayload = via((f) => ({
  label: f(String),
  size: f(Int),
  labels: f([String]),
  meta: f(Map, { of: String }),
}));
ConstantRegistry.buildScalar("adversarialProbePayload", AdversarialProbePayload, { AdversarialProbePayload });

//? MCP publishes no mutation guarded by `Public` alone, so the probe needs a real guard that admits everyone.
class ProbeCaller implements Guard {
  static name = "ProbeCaller";
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}

export const probeArgNames = [
  "name",
  "id",
  "count",
  "ratio",
  "flag",
  "when",
  "tags",
  "status",
  "payload",
  "note",
] as const;
export type ProbeArgName = (typeof probeArgNames)[number];

export const probeReceived: { args: unknown[] | null } = { args: null };
const record = (args: unknown[]) => {
  probeReceived.args = args;
  return "ok";
};

export class AdversarialProbeEndpoint extends endpoint(ServiceModel.from(AdversarialProbeService), (builder) => ({
  probeWrite: builder
    .mutation(String, { guards: [ProbeCaller] })
    .body("name", String)
    .body("id", ID)
    .body("count", Int)
    .body("ratio", Float)
    .body("flag", Boolean)
    .body("when", Date)
    .body("tags", [String])
    .body("status", AdversarialProbeStatus)
    .body("payload", AdversarialProbePayload)
    .body("note", String, { nullable: true })
    .exec((...args) => record(args)),
  probeSend: builder
    .message(String, { guards: [ProbeCaller] })
    .msg("name", String)
    .msg("id", ID)
    .msg("count", Int)
    .msg("ratio", Float)
    .msg("flag", Boolean)
    .msg("when", Date)
    .msg("tags", [String])
    .msg("status", AdversarialProbeStatus)
    .msg("payload", AdversarialProbePayload)
    .msg("note", String, { nullable: true })
    .exec((...args) => record(args)),
})) {}

export type Transport = "http" | "ws" | "mcp";
export const transports: readonly Transport[] = ["http", "ws", "mcp"];

export interface Outcome {
  transport: Transport;
  received: string | null;
  status: number;
  code: string | null;
  text: string;
  errorLogs: string[];
}

//? JSON text, not an object: only text can repeat a name or spell -0, 1e400 and 2^53 + 1 as sent.
export const INVALID_UTF8 = "__adversarial_invalid_utf8__";

export type WireEntry = readonly [name: string, json: string];

const objectText = (entries: readonly WireEntry[]) =>
  `{${entries.map(([name, json]) => `${JSON.stringify(name)}:${json}`).join(",")}}`;

const frameText = (key: string, entries: readonly WireEntry[]) => {
  const passes: Map<string, string>[] = [new Map()];
  for (const [name, json] of entries) {
    const last = passes[passes.length - 1];
    if (last.has(name)) passes.push(new Map([...last, [name, json]]));
    else last.set(name, json);
  }
  const dataOf = (pass: Map<string, string>) => {
    const declared = probeArgNames.map((name) => pass.get(name) ?? null);
    while (declared.length && declared.at(-1) === null) declared.pop();
    const extra = [...pass].filter(([name]) => !(probeArgNames as readonly string[]).includes(name));
    const positions = [...declared.map((json) => json ?? "null"), ...extra.map(([, json]) => json)];
    return `"data":[${positions.join(",")}]`;
  };
  return `{"key":${JSON.stringify(key)},${passes.map(dataOf).join(",")}}`;
};

export const mcpCallText = (tool: string, args: string) =>
  `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":${JSON.stringify(tool)},"arguments":${args}}}`;

const wireOf = (text: string): string | Uint8Array<ArrayBuffer> => {
  const at = text.indexOf(INVALID_UTF8);
  if (at < 0) return text;
  const encoder = new TextEncoder();
  const head = encoder.encode(text.slice(0, at));
  const tail = encoder.encode(text.slice(at + INVALID_UTF8.length));
  return new Uint8Array([...head, 0xc3, 0x28, 0xff, ...tail]);
};

export const describeValue = (value: unknown): string => {
  const seen = new Set<unknown>();
  const walk = (item: unknown): unknown => {
    if (item === undefined) return "<undefined>";
    if (typeof item === "number")
      return Object.is(item, -0) ? "<-0>" : Number.isFinite(item) ? item : `<${String(item)}>`;
    if (typeof item === "bigint") return `<${item}n>`;
    if (item === null || typeof item !== "object") return item;
    if (dayjs.isDayjs(item)) return { "<dayjs>": item.isValid() ? item.toISOString() : "<invalid>" };
    if (item instanceof Date) return { "<date>": Number.isNaN(item.getTime()) ? "<invalid>" : item.toISOString() };
    if (seen.has(item)) return "<cycle>";
    seen.add(item);
    if (item instanceof Map) return { "<map>": [...item].map(([key, entry]) => [walk(key), walk(entry)]) };
    if (Array.isArray(item)) return item.map(walk);
    const proto = Object.getPrototypeOf(item);
    const tag = proto === Object.prototype ? "" : proto === null ? "<null-proto>" : `<${proto?.constructor?.name}>`;
    const own = Object.getOwnPropertyNames(item).sort();
    return { ...(tag ? { "<proto>": tag } : {}), "<own>": own.map((key) => [key, walk((item as never)[key])]) };
  };
  return JSON.stringify(walk(value));
};

const errorCodeOf = (body: unknown): string | null => {
  if (!body || typeof body !== "object") return null;
  const { code, error } = body as { code?: unknown; error?: unknown };
  if (typeof code === "string") return code;
  return typeof error === "string" ? error : null;
};

interface FakeSocket {
  data: Record<string, unknown>;
  sent: string[];
  remoteAddress: string;
  send: (frame: string) => void;
  subscribe: () => void;
  unsubscribe: () => void;
}

export class AdversarialHarness {
  readonly #httpWrite: (req: Bun.BunRequest) => Promise<Response | undefined>;
  readonly #wsMessage: (ws: Bun.ServerWebSocket<unknown>, message: string | Buffer) => Promise<void>;
  readonly #mcpPost: (req: Request) => Promise<Response>;
  readonly #errorLogs: string[] = [];
  readonly #restore: (() => void)[] = [];

  constructor() {
    const registry = getDefaultInjectRegistry();
    const live = getDefaultLiveRegistry();
    const instance = new AdversarialProbeEndpoint();
    registry.endpoint.set(AdversarialProbeEndpoint, instance);
    live.endpointCls.set("adversarialProbe", AdversarialProbeEndpoint);
    const env = {};
    const middleware = new Map();
    const { routes, wsRoutes } = SignalResolver.resolveEndpoint(AdversarialProbeEndpoint, instance, {
      registry,
      env,
      live,
      middleware,
    });
    const writePath = Object.keys(routes ?? {}).find((path) => path.endsWith("/probeWrite")) ?? "";
    this.#httpWrite = (routes as Record<string, { POST: (req: Bun.BunRequest) => Promise<Response | undefined> }>)[
      writePath
    ].POST;
    const handlers = ApiRouter.buildWebsocketHandlers({
      wsRoutes,
      registry,
      live,
      hmrHub: null,
      hmrState: null,
      logger: new Logger("AdversarialInput"),
    });
    this.#wsMessage = handlers.message as never;
    const mcp = new McpRouter({ registry, live, middleware, env, rateLimit: false }).createRoutes() as Record<
      string,
      Record<string, (req: Request) => Promise<Response>>
    >;
    this.#mcpPost = mcp["/mcp"].POST;
  }

  //? Production answers, not a developer's: `detailed` mode puts the message and stack into every 500 on purpose.
  open() {
    const nodeEnv = process.env.NODE_ENV;
    const detail = process.env.AKAN_ERROR_DETAIL;
    const consoleOutput = Logger.consoleOutput;
    process.env.NODE_ENV = "production";
    delete process.env.AKAN_ERROR_DETAIL;
    SignalFailure.reset();
    Logger.consoleOutput = false;
    const removeSink = Logger.addSink((entry: LoggerSinkEntry) => void this.#errorLogs.push(`${entry.plainMessage}`), {
      minLevel: "error",
    });
    this.#restore.push(() => {
      removeSink();
      Logger.consoleOutput = consoleOutput;
      if (nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = nodeEnv;
      if (detail !== undefined) process.env.AKAN_ERROR_DETAIL = detail;
      SignalFailure.reset();
    });
  }

  close() {
    for (const restore of this.#restore.splice(0).reverse()) restore();
  }

  async run(transport: Transport, entries: readonly WireEntry[]): Promise<Outcome> {
    const text =
      transport === "http"
        ? objectText(entries)
        : transport === "ws"
          ? frameText("probeSend", entries)
          : mcpCallText("probeWrite", objectText(entries));
    return await this.raw(transport, wireOf(text));
  }

  async raw(
    transport: Transport,
    wire: string | Uint8Array<ArrayBuffer>,
    contentType = "application/json",
  ): Promise<Outcome> {
    probeReceived.args = null;
    this.#errorLogs.length = 0;
    const seen = await this.#send(transport, wire, contentType).catch((error: unknown) => ({
      status: 0,
      code: "<thrown>",
      text: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    const received = probeReceived.args;
    probeReceived.args = null;
    return { transport, ...seen, received: received ? describeValue(received) : null, errorLogs: [...this.#errorLogs] };
  }

  async #send(transport: Transport, wire: string | Uint8Array<ArrayBuffer>, contentType: string) {
    if (transport === "http") return await this.#sendHttp(wire, contentType);
    if (transport === "ws") return await this.#sendWs(wire);
    return await this.#sendMcp(wire, contentType);
  }

  async #sendHttp(body: string | Uint8Array<ArrayBuffer>, contentType: string) {
    const req = Object.assign(
      new Request("http://localhost/adversarialProbe/probeWrite", {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      }),
      { params: {} },
    ) as unknown as Bun.BunRequest;
    const res = await this.#httpWrite(req);
    const text = res ? await res.text() : "";
    const parsed = AdversarialHarness.#json(text);
    return { status: res?.status ?? 0, code: res && res.status >= 400 ? errorCodeOf(parsed) : null, text };
  }

  async #sendWs(frame: string | Uint8Array<ArrayBuffer>) {
    const socket: FakeSocket = {
      data: {},
      sent: [],
      remoteAddress: "127.0.0.1",
      send(sent: string) {
        socket.sent.push(sent);
      },
      subscribe() {},
      unsubscribe() {},
    };
    const message = typeof frame === "string" ? frame : Buffer.from(frame);
    await this.#wsMessage(socket as unknown as Bun.ServerWebSocket<unknown>, message);
    const text = socket.sent.join("\n");
    const reply = AdversarialHarness.#json(socket.sent.at(-1) ?? "") as
      | { type?: string; statusCode?: unknown }
      | undefined;
    if (reply?.type === "msg") return { status: 200, code: null, text };
    const status = typeof reply?.statusCode === "number" ? reply.statusCode : 0;
    return { status, code: errorCodeOf(reply), text };
  }

  async #sendMcp(body: string | Uint8Array<ArrayBuffer>, contentType: string) {
    const res = await this.#mcpPost(
      new Request("http://127.0.0.1:8080/mcp", { method: "POST", headers: { "content-type": contentType }, body }),
    );
    const text = await res.text();
    const parsed = AdversarialHarness.#json(text) as
      | {
          result?: { isError?: boolean; _meta?: Record<string, { code?: string; statusCode?: number }> };
          error?: { data?: { code?: string } };
        }
      | undefined;
    if (parsed?.error) return { status: 400, code: parsed.error.data?.code ?? null, text };
    if (!parsed?.result) return { status: res.status, code: null, text };
    if (!parsed.result.isError) return { status: 200, code: null, text };
    const failure = parsed.result._meta?.[MCP_FAILURE_META];
    return { status: failure?.statusCode ?? 500, code: failure?.code ?? null, text };
  }

  static #json(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
