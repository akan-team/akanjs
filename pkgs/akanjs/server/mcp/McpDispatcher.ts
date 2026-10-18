import { type BackendEnv, ENDPOINT_META, ImageResult, type ImageResultValue, PrimitiveRegistry } from "akanjs/base";
import { interpolateTranslation, Logger } from "akanjs/common";
import { agentRead, ConstantRegistry, mask } from "akanjs/constant";
import { DictionaryLookup } from "akanjs/dictionary";
import { NoDocumentError } from "akanjs/document";
import type { InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Endpoint, EndpointCls } from "../../signal/endpoint";
import type { EndpointInfo } from "../../signal/endpointInfo";
import { Exception, isExceptionLike } from "../../signal/exception";
import type { GuardCls } from "../../signal/guard";
import { MCP_APP_META, McpDocument, type McpExposedEndpoint, type McpToolResult } from "../../signal/mcp";
import type { MiddlewareCls } from "../../signal/middleware";
import { SignalContext } from "../../signal/signalContext";
import { McpArgumentError, McpExecutionContext } from "./McpExecutionContext";

// The caller presented no credential at all, so the client must be told to authenticate.
export class McpAuthRequiredError extends Error {}

interface McpDispatcherProps {
  registry: InjectRegistry;
  env: BackendEnv;
  live: LiveRegistry;
  middleware: Map<string, MiddlewareCls>;
  language?: string;
  legacyTextBlock?: boolean;
}

export class McpDispatcher {
  static readonly logger = new Logger("McpDispatcher");

  static readonly structuredNote = "The result is in this call's structuredContent.";

  readonly #props: McpDispatcherProps;
  #endpoints: Map<string, { endpointInfo: EndpointInfo; endpoint: Endpoint }> | null = null;
  // Lazy: the dictionary merge is not free, and only a failing call needs it.
  #lookup: DictionaryLookup | null = null;

  constructor(props: McpDispatcherProps) {
    this.#props = props;
  }

  // `forView`: an MCP Apps view also gets the value a browser would — `visual` fields and a primitive's own form kept,
  // `hidden`/`secret` already gone — in `_meta`, which no host shows the model. That is cost, never a secret.
  async call(
    exposed: McpExposedEndpoint,
    args: Record<string, unknown>,
    req: Request,
    { forView = false }: { forView?: boolean } = {},
  ): Promise<McpToolResult> {
    const found = this.#index().get(exposed.key);
    if (!found) return McpDispatcher.#failure(`Tool "${exposed.key}" is declared but not mounted on this server.`);
    try {
      const wire = await this.#exec(exposed.key, found, args, req);
      const view = forView ? { _meta: { [MCP_APP_META.value]: wire ?? null } } : {};
      if (exposed.endpoint.returns.refName === ImageResult.refName) {
        const image = McpDispatcher.#imageResult(exposed, wire);
        return image.isError ? image : { ...image, ...view };
      }
      const value = McpDispatcher.#readable(exposed, wire);
      const structuredContent = McpDocument.structuredContent(exposed.endpoint, value);
      return {
        content: this.#content(structuredContent, value),
        ...(structuredContent === undefined ? {} : { structuredContent }),
        ...view,
        isError: false,
      };
    } catch (error) {
      const status = McpDispatcher.#statusOf(error);
      // No credential: a 401 challenge, as only the client can fix it. A refused one: a tool error the model acts on.
      if ((status === 401 || status === 403) && !req.headers.get("authorization")) throw new McpAuthRequiredError();
      const failure = McpDispatcher.#failure(this.#message(error, status, exposed.refName));
      const restorable = forView ? McpDispatcher.#restorable(error, status) : null;
      return restorable ? { ...failure, _meta: { [MCP_APP_META.error]: restorable } } : failure;
    }
  }

  // The `Err` a browser's own call would have answered with, in the shape its own `toJSON()` gives the HTTP path, so
  // the view toasts it in the user's language. Never a refusal (it names the guard structure), and nothing that is
  // not an `Err`: the HTTP path generalizes the rest too.
  static #restorable(error: unknown, status: number | undefined) {
    if (!status || status >= 500 || status === 401 || status === 403) return null;
    return isExceptionLike(error) ? error.toJSON() : null;
  }

  // A UX filter, never the access decision: entries without an account guard stay listed and are stopped at call time.
  // Not `init()`-ed: a listing has no arguments, and a resource guard reached here reads undefined and fails closed.
  async filterForAccount<T extends { name: string }>(items: T[], req: Request): Promise<T[]> {
    const index = this.#index();
    // One verdict per distinct account-guard set, since each runs the middleware chain (a JWT verification). Sound
    // because an account guard reads only the caller; one reading `context.key` is a mismarked resource guard.
    const ids = new Map<GuardCls, number>();
    const idOf = (GuardCls: GuardCls) => {
      const id = ids.get(GuardCls);
      if (id !== undefined) return id;
      ids.set(GuardCls, ids.size);
      return ids.size - 1;
    };
    const cached = new Map<string, Promise<boolean>>();
    const verdicts = await Promise.all(
      items.map(async (item) => {
        const found = index.get(item.name);
        if (!found) return true;
        const guards = (found.endpointInfo.signalOption.guards ?? []).filter(
          (GuardCls) => GuardCls.scope === "account",
        );
        if (!guards.length) return true;
        const key = guards
          .map(idOf)
          .sort((a, b) => a - b)
          .join(",");
        const verdict =
          cached.get(key) ??
          new SignalContext(item.name, req as Bun.BunRequest, {
            ...this.#props,
            endpointInfo: found.endpointInfo,
            adaptor: found.endpoint,
            ctx: new McpExecutionContext(req, {}),
            origin: "mcp",
          }).canListForAccount();
        cached.set(key, verdict);
        return await verdict;
      }),
    );
    return items.filter((_item, idx) => verdicts[idx]);
  }

  async #exec(
    key: string,
    { endpointInfo, endpoint }: { endpointInfo: EndpointInfo; endpoint: Endpoint },
    args: Record<string, unknown>,
    req: Request,
  ) {
    // `run`, not `.try`: `.try` puts the stack in its 500 body, and an agent would quote it back into a transcript.
    return await SignalContext.run(endpoint, endpointInfo, key, "mcp", async () => {
      const context = await new SignalContext(key, req as Bun.BunRequest, {
        ...this.#props,
        endpointInfo,
        adaptor: endpoint,
        ctx: new McpExecutionContext(req, args),
        origin: "mcp",
      }).init();
      return (await context.exec()) as unknown;
    });
  }

  isEndpoint(name: string) {
    return this.#index().has(name);
  }

  // Lazy for cost, not ordering: DI filled the registry long before any route was created.
  #index() {
    if (this.#endpoints) return this.#endpoints;
    const endpoints = new Map<string, { endpointInfo: EndpointInfo; endpoint: Endpoint }>();
    for (const [endpointCls, endpoint] of this.#props.registry.endpoint.entries()) {
      const meta = (endpointCls as EndpointCls)[ENDPOINT_META] as { [key: string]: EndpointInfo };
      for (const [key, endpointInfo] of Object.entries(meta)) endpoints.set(key, { endpointInfo, endpoint });
    }
    this.#endpoints = endpoints;
    return endpoints;
  }

  #message(error: unknown, status: number | undefined, refName: string): string {
    // Restated here, not at the throw site: internal callers match on its `No Document (x): <id>` wording.
    if (error instanceof NoDocumentError) return `No ${refName} found for the arguments given.`;
    if (status && status < 500) {
      // Security: every refusal reads the same — a guard's own message names the authorization structure.
      if (status === 401 || status === 403) return "You are not permitted to perform this action.";
      const raw = error instanceof Error ? error.message : String(error);
      // A domain `Err` carries its dictionary key as the message; anything else is already prose.
      this.#lookup ??= new DictionaryLookup(this.#props.language);
      const text = this.#lookup.text(raw);
      if (text) return interpolateTranslation(text, (error as { data?: Record<string, unknown> }).data);
      return raw;
    }
    // Security: logged in full, answered flat — what an agent quotes back is what an attacker would read.
    if (!SignalContext.wasReported(error))
      McpDispatcher.logger.error(`MCP call failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
    return "The server failed to complete this request.";
  }

  // No status reads as a crash, so an agent-triggerable McpArgumentError carries one (a NoDocumentError is
  // exception-like).
  // Security: only what HTTP forwards keeps its status — a vendor client's own 4xx error is generalized there too.
  static #statusOf(error: unknown): number | undefined {
    if (isExceptionLike(error) || error instanceof McpArgumentError) return error.statusCode;
    return undefined;
  }

  // -32602 covers not-found too: this revision retired -32002 and points resource-not-found at invalid params.
  // The pointer keeps `content` non-empty: a client rendering an empty `content[0].text` shows an empty answer.
  #content(structuredContent: unknown, value: unknown): McpToolResult["content"] {
    if (structuredContent !== undefined && this.#props.legacyTextBlock === false)
      return [{ type: "text", text: McpDispatcher.structuredNote }];
    return [{ type: "text", text: McpDispatcher.#text(structuredContent, value) }];
  }

  // A string scalar goes raw, since JSON would hand a model quotes to strip. `JSON.stringify(undefined)` is
  // undefined, so a void return would otherwise ship a block with no `text`.
  static #text(structuredContent: unknown, value: unknown) {
    if (structuredContent === undefined && typeof value === "string") return value;
    return JSON.stringify(structuredContent ?? value) ?? "null";
  }

  // Strips `visual` fields here, not in `resolveReturn`: a browser must still receive them.
  static #readable(exposed: McpExposedEndpoint, value: unknown): unknown {
    const { refName, modelType, arrDepth = 0 } = exposed.endpoint.returns;
    if (!modelType)
      return PrimitiveRegistry.hasName(refName) ? agentRead(PrimitiveRegistry.get(refName), value, arrDepth) : value;
    try {
      return mask(ConstantRegistry.getModelRef(refName, modelType), value);
    } catch (error) {
      // Fail closed: masking decides what may go out, and an unmaskable result is a catalogue bug to report.
      McpDispatcher.logger.error(
        `MCP could not mask a "${refName}" (${modelType}) result, so it was not sent: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new Exception.Error("The server failed to complete this request.");
    }
  }

  // No structuredContent and no JSON text block: either would repeat hundreds of KB of base64 the image block carries.
  static #imageResult(exposed: McpExposedEndpoint, value: unknown): McpToolResult {
    if (value === null || value === undefined) return { content: [{ type: "text", text: "null" }], isError: false };
    const images = (exposed.endpoint.returns.arrDepth ? [value].flat(Number.POSITIVE_INFINITY) : [value]) as unknown[];
    if (!images.length) return { content: [{ type: "text", text: "[]" }], isError: false };
    if (!images.every((image) => ImageResult.validate(image as ImageResultValue))) {
      McpDispatcher.logger.error(
        `MCP refused the "${exposed.key}" image result: an ImageResult needs \`data\` in padded base64 without a \`data:\` prefix and a \`mimeType\` of ${ImageResult.mimeTypes.join(", ")}.`,
      );
      return McpDispatcher.#failure("The server failed to complete this request.");
    }
    const content = (images as ImageResultValue[]).flatMap(({ data, mimeType, caption }) => [
      ...(caption ? [{ type: "text" as const, text: caption }] : []),
      { type: "image" as const, data, mimeType },
    ]);
    return { content, isError: false };
  }

  static #failure(message: string): McpToolResult {
    return { content: [{ type: "text", text: message }], isError: true };
  }
}
