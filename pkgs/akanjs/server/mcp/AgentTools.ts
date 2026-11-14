import type { BackendEnv, ImageResultValue } from "akanjs/base";
import { DictionaryLookup } from "akanjs/dictionary";
import {
  type AgentTool,
  type AgentToolsAdaptor,
  type AgentToolsCaller,
  AgentToolsRole,
  type AgentWireToolCall,
  type AgentWireToolResult,
  adapt,
  InjectError,
  type InjectRegistry,
  type LiveRegistry,
} from "akanjs/service";
import { carriedClientIps } from "../../signal/carriedClientIps";
import { McpDocument, type McpExposedEndpoint } from "../../signal/mcp";
import type { MiddlewareCls } from "../../signal/middleware";
import { FetchSerializer } from "../../signal/serializer";
import type { DiLifecycle } from "../di/diLifecycle";
import { AgentToolsAccount } from "./AgentToolsAccount";
import { McpDispatcher } from "./McpDispatcher";

export interface AgentToolsCatalogue {
  readOnly?: boolean;
  excludeSignals?: string[];
  excludeEndpoints?: string[];
  language?: string;
}

interface AgentToolsServer {
  env: BackendEnv;
  mcpOption: AgentToolsCatalogue;
  mcpReadOnly: boolean;
}

interface AgentToolsProps extends AgentToolsCatalogue {
  registry: InjectRegistry;
  env: BackendEnv;
  live: LiveRegistry;
  middleware: ReadonlyMap<string, MiddlewareCls>;
  endpointsBuilt: () => boolean;
}

export class AgentTools extends adapt("agentTools") implements AgentToolsAdaptor {
  static readonly #origin = "http://agent-tools.invalid";
  static readonly #dropped = ["authorization", "cookie", "origin"];
  readonly #props: AgentToolsProps;
  readonly #dispatcher: McpDispatcher;
  #document: McpDocument | null = null;

  constructor(props: AgentToolsProps) {
    super();
    this.#props = props;
    this.#dispatcher = new McpDispatcher({
      registry: props.registry,
      env: props.env,
      live: props.live,
      middleware: new Map([...props.middleware, [AgentToolsAccount.refName, AgentToolsAccount]]),
      language: props.language ?? "en",
    });
  }

  // Before the services stage, which injects it: it wraps this container's registry and middlewares, which no stage hands over.
  static provide(
    { registry, live, modules, initTimings }: DiLifecycle,
    { env, mcpOption, mcpReadOnly }: AgentToolsServer,
  ) {
    const tools = new AgentTools({
      ...mcpOption,
      readOnly: mcpReadOnly,
      registry,
      env,
      live,
      middleware: modules.middleware,
      endpointsBuilt: () => initTimings.has("endpoints"),
    });
    registry.adaptorRole.set(AgentToolsRole, AgentTools);
    registry.adaptorCls.set(AgentToolsRole.refName, AgentToolsRole);
    registry.adaptor.set(AgentTools, tools);
    registry.adaptor.set(AgentToolsRole, tools);
    return tools;
  }

  async listAs(account: unknown, caller: AgentToolsCaller = {}): Promise<AgentTool[]> {
    const allowed = caller.allow ? new Set(caller.allow) : null;
    const tools = this.#getDocument().tools.filter((tool) => !allowed || allowed.has(tool.name));
    const visible = await this.#dispatcher.filterForAccount(tools, this.#request(account, caller));
    return visible.map(({ name, title, description = title, inputSchema, annotations }) => ({
      name,
      ...(description ? { description } : {}),
      parameters: inputSchema,
      readOnly: annotations?.readOnlyHint === true,
      needsConfirm: annotations?.destructiveHint === true,
    }));
  }

  async callAs(account: unknown, call: AgentWireToolCall, caller: AgentToolsCaller = {}): Promise<AgentWireToolResult> {
    const { id, name } = call;
    const document = this.#getDocument();
    const exposed = caller.allow && !caller.allow.includes(name) ? undefined : document.findTool(name);
    // Security: outside `allow` reads exactly like nonexistent, as `/mcp` answers an unpublished name.
    if (!exposed) return { id, name, error: `Unknown tool: ${name}.`, code: "unknownTool" };
    const answer = await this.#dispatcher.answer(exposed, call.args ?? {}, this.#request(account, caller));
    if ("error" in answer) return { id, name, error: answer.error, code: answer.code };
    if ("value" in answer) return { id, name, result: answer.value };
    return AgentTools.#withImages(exposed, call, answer.images);
  }

  static #withImages(
    exposed: McpExposedEndpoint,
    { id, name }: AgentWireToolCall,
    images: ImageResultValue[],
  ): AgentWireToolResult {
    const attachments = images.map(({ data, mimeType }, idx) => ({
      name: `${exposed.key}-${idx + 1}`,
      mimeType,
      data,
    }));
    const listed = images.map(({ mimeType, caption }) => ({ mimeType, ...(caption ? { caption } : {}) }));
    return { id, name, result: exposed.endpoint.returns.arrDepth ? listed : listed[0], attachments };
  }

  #request(account: unknown, { headers, ip = null }: AgentToolsCaller) {
    const forwarded = new Headers(headers);
    for (const header of AgentTools.#dropped) forwarded.delete(header);
    const req = new Request(`${AgentTools.#origin}/agent-tools`, { method: "POST", headers: forwarded });
    // Security: no proxy wrote this request's forwarding headers, so they never count.
    carriedClientIps.set(req, { ip, trustedHop: false });
    if (account !== null && account !== undefined) AgentToolsAccount.vouch(req, account);
    return req;
  }

  // Lazy: the signals it reads are registered only once DI has built every endpoint, after this adaptor exists.
  #getDocument() {
    if (this.#document) return this.#document;
    if (!this.#props.endpointsBuilt())
      throw new InjectError(
        "notInitialized",
        "AgentToolsRole answers only once the server has built its endpoints, after every service's onInit. Call listAs or callAs from a request, a job or a schedule.",
      );
    const lookup = new DictionaryLookup(this.#props.language ?? "en");
    this.#document = new McpDocument(FetchSerializer.serializeRegistry(this.#props.live).signal, {
      resolveDescription: (key) => lookup.text(key),
      readOnly: this.#props.readOnly,
      agent: true,
      excludeSignals: this.#props.excludeSignals,
      excludeEndpoints: this.#props.excludeEndpoints,
    });
    return this.#document;
  }
}
