import { type Cls, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { isMcpDescribableArg } from "akanjs/common";
import { InputParser, InvalidInputError, serialize } from "akanjs/constant";
import type { EndpointInfo } from "../../signal/endpointInfo";
import { HttpExecutionContext } from "../../signal/signalContext";

type McpArg = EndpointInfo["args"][number];

// Carries a 400 so it reports as a tool error: argument parsers throw bare Errors, indistinguishable from a crash.
export class McpArgumentError extends Error {
  readonly statusCode = 400;
}

// An HTTP context on purpose: AccountMiddleware, Self/Me and every guard read the request through it.
export class McpExecutionContext extends HttpExecutionContext {
  readonly #arguments: Record<string, unknown>;

  constructor(req: Request, args: Record<string, unknown>) {
    // Not a `BunRequest`: it carries no route `params`, which is exactly why `readArgs` is overridden below.
    super(req as Bun.BunRequest);
    this.#arguments = args;
  }

  // Absent values become null, as a missing query string does. Undeclared names are refused: clients often ignore
  // `additionalProperties: false`, and an unpublished `Any` arg would let an agent pass an arbitrary query.
  override async readArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
    const declared = new Set(endpointInfo.args.filter(McpExecutionContext.#describable).map((arg) => arg.name));
    const undeclared = Object.keys(this.#arguments).find((name) => !declared.has(name));
    if (undeclared) throw new McpArgumentError(`Unknown argument "${undeclared}".`);
    return endpointInfo.args.map((arg) => McpExecutionContext.#lift(arg, this.#arguments[arg.name] ?? null));
  }

  override parseArg(arg: McpArg, value: unknown): unknown {
    try {
      return InputParser.parse(arg.argRef, arg.arrDepth, value, {
        key: arg.name,
        nullable: arg.option?.nullable,
        enum: arg.enum,
      });
    } catch (error) {
      // The parser's message names internals; an agent retries on this one, so it must read as its own mistake.
      if (error instanceof InvalidInputError && error.path !== arg.name)
        throw new McpArgumentError(McpExecutionContext.#fieldMessage(error));
      throw new McpArgumentError(McpExecutionContext.#argumentMessage(arg, value));
    }
  }

  // Returns the serialized value, not a Response: the signature is the base class's, as WebSocketExecutionContext's is.
  override makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    if (endpointInfo.returns.arrDepth === 0 && PrimitiveRegistry.has(endpointInfo.returns.returnRef as Cls))
      return result as unknown as Response;
    return serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    }) as unknown as Response;
  }

  // Models send a bare value for an array, and `deserialize` hands a lone scalar back instead of lifting it.
  static #lift(arg: McpArg, value: unknown) {
    return arg.arrDepth && value !== null && !Array.isArray(value) ? [value] : value;
  }

  // The same rule `McpDocument` builds `properties` from, so what is refused is exactly what was not published.
  static #describable(arg: McpArg) {
    const refName = PrimitiveRegistry.has(arg.argRef as Cls)
      ? PrimitiveRegistry.getName(arg.argRef as typeof PrimitiveScalar)
      : "";
    return isMcpDescribableArg({ refName });
  }

  static #fieldMessage({ path, expected }: InvalidInputError) {
    return expected ? `Invalid field "${path}": expected ${expected}.` : `Missing required field "${path}".`;
  }

  static #argumentMessage(arg: McpArg, value: unknown) {
    if (value === null) return `Missing required argument "${arg.name}".`;
    if (arg.enum) return `Invalid argument "${arg.name}": expected one of ${arg.enum.values.join(", ")}.`;
    const primitive = PrimitiveRegistry.has(arg.argRef as Cls)
      ? PrimitiveRegistry.getName(arg.argRef as typeof PrimitiveScalar)
      : undefined;
    const expected = primitive ? `${primitive}${"[]".repeat(arg.arrDepth)}` : undefined;
    return `Invalid argument "${arg.name}"${expected ? `: expected ${expected}` : ""}.`;
  }
}
