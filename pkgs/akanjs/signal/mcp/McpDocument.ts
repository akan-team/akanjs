import { isMcpDescribableArg, lowerlize, mcpHintsOf, mcpRefusalOf } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { type AgentCandidate, AgentCatalogue, type AgentRefusal, type AgentUndescribed } from "../agent";
import { type JsonSchema, JsonSchemaBuilder } from "../schema";
import type { SerializedArg, SerializedEndpoint, SerializedSignal } from "../types";
import { McpUriTemplate } from "./McpUriTemplate";
import type { McpResource, McpResourceTemplate, McpTool, McpToolAnnotations } from "./mcpProtocol";

export interface McpDocumentOptions {
  resolveDescription?: (key: string) => string | undefined;
  excludeSignals?: string[];
  /** Drops every mutation from the catalogue whatever its guards allow. Off by default. */
  readOnly?: boolean;
  /**
   * `shallow` (default) names each nested model instead of inlining it, `full` inlines the closure, `none` publishes
   * no `outputSchema` (results still ship as `structuredContent`).
   */
  outputSchema?: McpOutputSchemaMode;
  /**
   * MCP Apps: an endpoint kept off the shelf only by `mcp: false`, or the `light<Model>` read a relation field makes,
   * is published as an app-only tool, which a host lists to the views it renders and never to the model. Every other
   * refusal still holds.
   */
  apps?: boolean;
}

export type McpOutputSchemaMode = "full" | "shallow" | "none";

type McpSchemaSide = "input" | "output";

export interface McpExposedEndpoint {
  refName: string;
  key: string;
  endpoint: SerializedEndpoint;
}

export type McpRefusal = AgentRefusal;
export type McpUndescribed = AgentUndescribed;

export interface McpSignalCost {
  refName: string;
  entries: number;
  bytes: number;
}

export interface McpListingCost {
  bytes: number;
  bySignal: McpSignalCost[];
}

export class McpDocument {
  /** The spec types `structuredContent` as an object, so a list result is wrapped under this key. */
  static readonly listKey = "items";

  readonly tools: McpTool[];
  /** `visibility: ["app"]` — callable by a rendered view, absent from every model-facing list. */
  readonly appTools: McpTool[];
  /** Each app tool, and the refusal that keeps it from a model. */
  readonly appOnly: McpRefusal[];
  readonly resourceTemplates: McpResourceTemplate[];
  /** Every readable thing is addressed by a template, so there are no fixed resources to enumerate. */
  readonly resources: McpResource[] = [];
  readonly refusals: McpRefusal[];
  readonly undescribed: McpUndescribed[];
  readonly #schema = new JsonSchemaBuilder({ refPrefix: "#/$defs/", nullable: "type", face: "agent" });
  readonly #modelSchemas = new Map<McpSchemaSide, Record<string, JsonSchema>>();
  readonly #options: McpDocumentOptions;
  readonly #catalogue: AgentCatalogue;
  readonly #byToolName = new Map<string, McpExposedEndpoint>();
  readonly #templates = new Map<string, string>();
  readonly #appOnly: (McpExposedEndpoint & { reason: string })[] = [];
  #cost: McpListingCost | null = null;

  constructor(serializedSignal: Record<string, SerializedSignal>, options: McpDocumentOptions = {}) {
    this.#options = options;
    this.#catalogue = new AgentCatalogue(options);
    const tools = this.#collect(serializedSignal);
    this.refusals = this.#catalogue.refusals;
    this.tools = tools.map((item) => this.#tool(item));
    this.resourceTemplates = tools.flatMap((item) => {
      const uriTemplate = this.#templates.get(item.key);
      return uriTemplate ? [this.#template(item, uriTemplate)] : [];
    });
    // Read after the published texts resolve, which is what fills it, and before the app-only ones: no model reads those.
    this.undescribed = this.#catalogue.undescribed;
    this.appTools = this.#appOnly.map((item) => ({ ...this.#tool(item), _meta: { ui: { visibility: ["app"] } } }));
    this.appOnly = this.#appOnly.map(({ key, reason }) => ({ key, reason }));
  }

  get listingCost(): McpListingCost {
    if (this.#cost) return this.#cost;
    const bySignal = new Map<string, McpSignalCost>();
    const add = (refName: string, entry: unknown) => {
      const cost = bySignal.get(refName) ?? { refName, entries: 0, bytes: 0 };
      cost.entries += 1;
      cost.bytes += JSON.stringify(entry).length;
      bySignal.set(refName, cost);
    };
    for (const tool of this.tools) add(this.#byToolName.get(tool.name)?.refName ?? tool.name, tool);
    const costs = [...bySignal.values()].sort((a, b) => b.bytes - a.bytes);
    this.#cost = { bytes: costs.reduce((sum, cost) => sum + cost.bytes, 0), bySignal: costs };
    return this.#cost;
  }

  findTool(name: string): McpExposedEndpoint | undefined {
    return this.#byToolName.get(name);
  }

  resourceUri(key: string, args: Record<string, unknown>): string | undefined {
    const template = this.#templates.get(key);
    return template ? McpUriTemplate.expand(template, args) : undefined;
  }

  /** Only a published template resolves: an opted-out endpoint must be unreachable, not merely refused by guards. */
  resolveResource(uri: string) {
    const target = McpUriTemplate.parse(uri);
    if (!target || !this.#templates.has(target.endpointKey)) return null;
    const exposed = this.#byToolName.get(target.endpointKey);
    return exposed ? { exposed, args: target.args } : null;
  }

  static structuredContent(endpoint: SerializedEndpoint, value: unknown) {
    if (!endpoint.returns.modelType) return undefined;
    if (endpoint.returns.arrDepth) return { [McpDocument.listKey]: value };
    // `null` cannot be `structuredContent` (an object), so an empty nullable return ships as the text block alone.
    return value === null || value === undefined ? undefined : value;
  }

  #collect(serializedSignal: Record<string, SerializedSignal>): McpExposedEndpoint[] {
    const tools: McpExposedEndpoint[] = [];
    const appOnly: (McpExposedEndpoint & { reason: string })[] = [];
    for (const candidate of AgentCatalogue.candidates(serializedSignal, {
      excludeSignals: this.#options.excludeSignals,
    })) {
      const { refName, key, endpoint } = candidate;
      const item: McpExposedEndpoint = { refName, key, endpoint };
      const reason = mcpRefusalOf(endpoint, { refName, key, readOnly: this.#options.readOnly });
      if (reason && this.#isAppOnly(item)) {
        appOnly.push({ ...item, reason });
        continue;
      }
      if (reason) {
        this.#catalogue.refuse(key, reason);
        continue;
      }
      if (!this.#catalogue.claim(key)) continue;
      // A custom endpoint gets no template: `parse` would route the model's `akan://x/{xId}` to the model's own read.
      const uriTemplate = McpDocument.#addressable(candidate)
        ? McpDocument.#uriTemplate(refName, key, endpoint)
        : undefined;
      this.#byToolName.set(key, item);
      if (uriTemplate) this.#templates.set(key, uriTemplate);
      tools.push(item);
    }
    // Claimed after every published entry, so a name the model's shelf holds is never lost to one only a view calls.
    for (const item of appOnly) {
      if (!this.#catalogue.claim(item.key)) continue;
      this.#byToolName.set(item.key, item);
      this.#appOnly.push(item);
    }
    return tools;
  }

  isAppOnly(name: string): boolean {
    return this.#appOnly.some((item) => item.key === name);
  }

  #isAppOnly({ refName, key, endpoint }: McpExposedEndpoint) {
    if (!this.#options.apps) return false;
    return !mcpRefusalOf(endpoint, { refName, key, readOnly: this.#options.readOnly, view: true });
  }

  static #addressable({ origin, refName, key, baseVerb }: AgentCandidate): boolean {
    if (origin === "base") return baseVerb === "get";
    if (origin === "slice") return key.startsWith(`${refName}List`);
    return false;
  }

  #tool({ refName, key, endpoint }: McpExposedEndpoint): McpTool {
    const { paramArgs, searchArgs, bodyArgs } = FetchClient.classifyHttpArgs(endpoint.args);
    // MCP hands over one flat named object, so path, query and body args are all just properties of it.
    const args = [...paramArgs, ...searchArgs, ...bodyArgs].filter(isMcpDescribableArg);
    const properties = Object.fromEntries(args.map((arg) => [arg.name, this.#argSchema(refName, key, arg)]));
    // A search arg is never required: the generated `skip`/`limit`/`sort` are serialized without a nullable flag.
    const required = [...paramArgs, ...bodyArgs]
      .filter((arg) => isMcpDescribableArg(arg) && !arg.nullable)
      .map((arg) => arg.name);
    const outputSchema = this.#outputSchema(endpoint);
    return {
      name: key,
      ...this.#withErrors(this.#catalogue.entryTexts(refName, key), endpoint),
      inputSchema: {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
        ...this.#defs(properties, "input"),
      },
      ...(outputSchema ? { outputSchema } : {}),
      annotations: mcpHintsOf(key, endpoint) satisfies McpToolAnnotations,
    };
  }

  // An agent reads the tool's description and nothing else, so the errors it may answer with are spelled there.
  #withErrors(texts: { title?: string; description?: string }, endpoint: SerializedEndpoint) {
    const errors = Object.entries(endpoint.errors ?? {}) as [string, readonly string[]][];
    if (!errors.length) return texts;
    const listed = errors
      .flatMap(([status, keys]) =>
        keys.map((key) => {
          const message = this.#options.resolveDescription?.(key);
          return `${status} ${key}${message ? ` (${message})` : ""}`;
        }),
      )
      .join(", ");
    const line = `Errors it answers with on purpose: ${listed}.`;
    return { ...texts, description: texts.description ? `${texts.description}\n${line}` : line };
  }

  #outputSchema(endpoint: SerializedEndpoint) {
    if (this.#options.outputSchema === "none") return undefined;
    // An `outputSchema` obliges every result to match it as an object, which a scalar or an empty (`null`) single
    // return cannot; a nullable list can, inside its `{ items }` wrapper.
    if (!endpoint.returns.modelType) return undefined;
    if (endpoint.returns.nullable && !endpoint.returns.arrDepth) return undefined;
    const returns = this.#schema.returns(endpoint.returns);
    const schema = endpoint.returns.arrDepth
      ? {
          type: "object",
          properties: { [McpDocument.listKey]: returns },
          required: [McpDocument.listKey],
          additionalProperties: false,
        }
      : returns;
    const defs = this.#defs(schema, "output");
    return { ...McpDocument.#objectRoot(schema, defs.$defs), ...defs };
  }

  // The spec types `outputSchema` as an object schema, and SDK clients reject a root `$ref` with the whole `tools/list`.
  // The model's definition is copied to the root and stays in `$defs`, where a self-reference still resolves.
  static #objectRoot(schema: Record<string, unknown>, defs: Record<string, unknown> | undefined) {
    const { $ref, ...rest } = schema;
    if (typeof $ref !== "string" || !$ref.startsWith("#/$defs/")) return schema;
    const target = defs?.[$ref.slice("#/$defs/".length)];
    return target && typeof target === "object" ? { ...(target as Record<string, unknown>), ...rest } : schema;
  }

  #defs(seed: unknown, side: McpSchemaSide) {
    const defs = this.#schema.referencedSchemas(seed, this.#modelSchemasOf(side));
    // The spec forbids dereferencing a `$ref` over the network, so every model a tool mentions travels inside it.
    return Object.keys(defs).length ? { $defs: defs } : {};
  }

  // A request asks for a relation's id, which is what the wire carries.
  #modelSchemasOf(side: McpSchemaSide) {
    const cached = this.#modelSchemas.get(side);
    if (cached) return cached;
    const schemas =
      side === "input"
        ? this.#schema.allModelSchemas({ relations: "id", idPattern: false })
        : this.#schema.allModelSchemas({
            // `resolveReturn` strips hidden/secret fields, and on a model like `user` their names alone are the leak.
            readable: true,
            relations: this.#options.outputSchema === "full" ? "inline" : "named",
            idPattern: false,
          });
    this.#modelSchemas.set(side, schemas);
    return schemas;
  }

  #argSchema(refName: string, key: string, arg: SerializedArg) {
    const description = this.#options.resolveDescription?.(`${refName}.signal.${key}.arg.${arg.name}.desc`);
    return {
      ...this.#schema.arg(arg),
      ...(description ? { description } : {}),
      ...(arg.example !== undefined ? { examples: [arg.example] } : {}),
    };
  }

  #template({ refName, key }: McpExposedEndpoint, uriTemplate: string): McpResourceTemplate {
    return {
      uriTemplate,
      name: key,
      ...this.#catalogue.entryTexts(refName, key),
      mimeType: "application/json",
    };
  }

  static #uriTemplate(refName: string, key: string, endpoint: SerializedEndpoint) {
    if (key === refName) return McpUriTemplate.model(refName);
    const listPrefix = `${refName}List`;
    if (!key.startsWith(listPrefix)) return undefined;
    const suffix = key.slice(listPrefix.length);
    // Read the args off the endpoint: pagination comes from the client generator, and a slice's required params
    // must be in the uri too — both travel as form-style query expansion, which `McpUriTemplate.parse` reads back.
    const argNames = endpoint.args
      .filter((arg) => (arg.type === "param" || arg.type === "search") && isMcpDescribableArg(arg))
      .map((arg) => arg.name);
    return McpUriTemplate.list(refName, lowerlize(suffix), argNames);
  }
}
