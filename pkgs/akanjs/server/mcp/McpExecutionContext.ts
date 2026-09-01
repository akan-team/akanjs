import { type Cls, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { isMcpDescribableArg } from "akanjs/common";
import { deserialize, serialize } from "akanjs/constant";
import type { EndpointInfo } from "../../signal/endpointInfo";
import { HttpExecutionContext } from "../../signal/signalContext";

type McpArg = EndpointInfo["args"][number];

/**
 * An argument the caller can fix, carrying a 400 so the dispatcher reports it as a tool error rather than as a
 * server failure. Everything that rejects an argument — the nullable check, `ID._parse`, a scalar's own
 * validator — throws a bare `Error`, and a bare `Error` is indistinguishable from a crash.
 */
export class McpArgumentError extends Error {
  readonly statusCode = 400;
}

/**
 * Runs an endpoint for an MCP call while staying an HTTP context.
 *
 * MCP arrives over HTTP and the whole authorization stack reads the request through this context —
 * `AccountMiddleware` resolves the bearer token off `getHttpContext().req`, and `Self`/`Me` and every guard read
 * what it left there. A transport of its own would not adapt that stack, it would bypass it.
 */
export class McpExecutionContext extends HttpExecutionContext {
  readonly #arguments: Record<string, unknown>;

  constructor(req: Request, args: Record<string, unknown>) {
    // Not a `BunRequest`: it carries no route `params`, which is exactly why `getArgs` is overridden below.
    super(req as Bun.BunRequest);
    this.#arguments = args;
  }

  /**
   * MCP passes one flat named object, so `param`/`search`/`body` all resolve by name from the same place. An
   * absent value becomes `null` to match what a missing query string yields, letting `deserialize` apply the
   * same nullability rules an HTTP call gets.
   *
   * A name nobody declared is the caller's mistake and is reported as one. `additionalProperties: false` travels
   * in the published schema, but this server does not validate against it and plenty of clients do not either —
   * so reading only the declared names dropped the rest in silence: `{ category, status }` on a slice that takes
   * only `category` came back as a successful, unfiltered list, which a model reads as the filter having applied.
   *
   * "Declared" means what the *published schema* declares, which is why an `Any` argument counts as absent here.
   * It is deliberately left out of that schema — the empty schema tells a model nothing — and the root list's raw
   * `query` descriptor is the one that matters: read as sent, an agent could hand any model exposed through
   * `mcp: { list: true }` an arbitrary query, which is precisely the narrowing a named filter slice exists to make
   * deliberate. `additionalProperties: false` was never going to stop that on its own.
   */
  override async getArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
    const declared = new Set(endpointInfo.args.filter(McpExecutionContext.#describable).map((arg) => arg.name));
    const undeclared = Object.keys(this.#arguments).find((name) => !declared.has(name));
    if (undeclared) throw new McpArgumentError(`Unknown argument "${undeclared}".`);
    return endpointInfo.args.map((arg) => {
      const value = McpExecutionContext.#lift(arg, this.#arguments[arg.name] ?? null);
      try {
        return deserialize(arg.argRef, arg.arrDepth, value, { key: arg.name, nullable: arg.option?.nullable });
      } catch {
        // What the parser says names internals; what the caller can act on is which argument and what it should
        // have been. An agent retries on this message, so it must not read as a server failure.
        throw new McpArgumentError(McpExecutionContext.#argumentMessage(arg, value));
      }
    });
  }

  /**
   * Returns the serialized value rather than a `Response`, so the router can put it straight into a JSON-RPC
   * result. The `Response` in the signature is the base class's; `WebSocketExecutionContext` widens it the same
   * way, and `SignalContext` only ever hands this value back to its caller.
   */
  override makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    if (endpointInfo.returns.arrDepth === 0 && PrimitiveRegistry.has(endpointInfo.returns.returnRef as Cls))
      return result as unknown as Response;
    return serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    }) as unknown as Response;
  }

  /**
   * One value where a list was declared becomes a one-element list. Both callers produce it: form-style uri
   * expansion writes `?tags=a` for a single tag, and a model routinely types a bare string for an array field.
   * The http context never meets this because `searchParams.getAll` always returns an array, and `deserialize`
   * hands a lone scalar straight back instead of lifting it — so the endpoint would receive a string where it
   * iterates a list.
   */
  static #lift(arg: McpArg, value: unknown) {
    return arg.arrDepth && value !== null && !Array.isArray(value) ? [value] : value;
  }

  /** The same rule `McpDocument` builds `properties` from, so what is refused is exactly what was not published. */
  static #describable(arg: McpArg) {
    const refName = PrimitiveRegistry.has(arg.argRef as Cls)
      ? PrimitiveRegistry.getName(arg.argRef as typeof PrimitiveScalar)
      : "";
    return isMcpDescribableArg({ refName });
  }

  static #argumentMessage(arg: McpArg, value: unknown) {
    if (value === null) return `Missing required argument "${arg.name}".`;
    const primitive = PrimitiveRegistry.has(arg.argRef as Cls)
      ? PrimitiveRegistry.getName(arg.argRef as typeof PrimitiveScalar)
      : undefined;
    const expected = primitive ? `${primitive}${"[]".repeat(arg.arrDepth)}` : undefined;
    return `Invalid argument "${arg.name}"${expected ? `: expected ${expected}` : ""}.`;
  }
}
