import { capitalize, isMcpDescribableArg, mcpHintsOf, mcpRefusalOf } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import { type AgentCandidate, AgentCatalogue, type AgentRefusal, type AgentUndescribed } from "../agent";
import { type JsonSchema, JsonSchemaBuilder } from "../schema";
import type { SerializedArg, SerializedEndpoint, SerializedSignal } from "../types";
import { McpUriTemplate } from "./McpUriTemplate";
import type { McpPrompt, McpResource, McpResourceTemplate, McpTool, McpToolAnnotations } from "./mcpProtocol";

export interface McpDocumentOptions {
  resolveDescription?: (key: string) => string | undefined;
  excludeSignals?: string[];
  /**
   * Drops every mutation from the catalogue regardless of what it opted into. Off by default: the endpoint's own
   * an endpoint's guards are the decision, and a second switch that silently unlists a published endpoint gives
   * its author no way to see why. This is the read-only-deployment valve.
   */
  readOnly?: boolean;
}

export interface McpExposedEndpoint {
  refName: string;
  key: string;
  endpoint: SerializedEndpoint;
}

/**
 * A candidate this catalogue did not publish. The bookkeeping is audience-independent and lives on
 * `AgentCatalogue`; these are the MCP names for it.
 */
export type McpRefusal = AgentRefusal;
export type McpUndescribed = AgentUndescribed;

/**
 * Turns the serialized signal registry into the three MCP catalogues and answers the lookups `tools/call` and
 * `resources/read` need. Pure: no IO and no DI — the sibling of `createOpenApiDocument`.
 */
export class McpDocument {
  /**
   * An array cannot be `structuredContent` — the spec types it as an object — so a list result is wrapped under
   * this key and `outputSchema` is shaped to match. Both halves must agree, which is why they live together.
   */
  static readonly listKey = "items";

  readonly tools: McpTool[];
  readonly prompts: McpPrompt[];
  readonly resourceTemplates: McpResourceTemplate[];
  /** Every readable thing is addressed by a template, so there are no fixed resources to enumerate. */
  readonly resources: McpResource[] = [];
  /**
   * Every candidate that was not published, with the sentence saying why — the rejections are fail-closed by
   * design, and an author whose endpoint is missing otherwise has nowhere to look but the framework source.
   */
  readonly refusals: McpRefusal[];
  /** What is published with no description of its own, which is the field a model picks a tool by. */
  readonly undescribed: McpUndescribed[];
  readonly #schema = new JsonSchemaBuilder({ refPrefix: "#/$defs/" });
  #allSchemas: Record<string, JsonSchema> | null = null;
  #readSchemas: Record<string, JsonSchema> | null = null;
  readonly #options: McpDocumentOptions;
  readonly #catalogue: AgentCatalogue;
  readonly #byToolName = new Map<string, McpExposedEndpoint>();
  readonly #byPromptName = new Map<string, { exposed: McpExposedEndpoint; prompt: McpPrompt }>();
  /** Keyed by endpoint key: what is addressable, and by exactly which uri. */
  readonly #templates = new Map<string, string>();

  constructor(serializedSignal: Record<string, SerializedSignal>, options: McpDocumentOptions = {}) {
    this.#options = options;
    this.#catalogue = new AgentCatalogue(options);
    const { tools, prompts } = this.#collect(serializedSignal);
    this.refusals = this.#catalogue.refusals;
    this.tools = tools.map((item) => this.#tool(item));
    this.prompts = prompts.map((item) => {
      const prompt = this.#prompt(item);
      this.#byPromptName.set(item.key, { exposed: item, prompt });
      return prompt;
    });
    this.resourceTemplates = tools.flatMap((item) => {
      const uriTemplate = this.#templates.get(item.key);
      return uriTemplate ? [this.#template(item, uriTemplate)] : [];
    });
    // Last: every branch above resolves text, and this is what they left behind.
    this.undescribed = this.#catalogue.undescribed;
  }

  findTool(name: string): McpExposedEndpoint | undefined {
    return this.#byToolName.get(name);
  }

  /** Returns the catalogue entry alongside the endpoint: `prompts/get` validates against the published one. */
  findPrompt(name: string) {
    return this.#byPromptName.get(name);
  }

  /**
   * Resolves a URI only when the endpoint behind it was published as a template. An endpoint that was never
   * advertised has to fail here rather than fall through to its guards: opting out of MCP means keeping a thing
   * off the wire entirely, not merely making it refuse.
   */
  resolveResource(uri: string) {
    const target = McpUriTemplate.parse(uri);
    if (!target || !this.#templates.has(target.endpointKey)) return null;
    const exposed = this.#byToolName.get(target.endpointKey);
    return exposed ? { exposed, args: target.args } : null;
  }

  static structuredContent(endpoint: SerializedEndpoint, value: unknown) {
    if (!endpoint.returns.modelType) return undefined;
    if (endpoint.returns.arrDepth) return { [McpDocument.listKey]: value };
    // A nullable return that found nothing has nowhere to ride: `structuredContent` is an object, so `null` is as
    // unshippable there as an array is. It goes out as the text block alone — `#outputSchema` declines to promise
    // a structured result for this shape, so nothing is left unmatched by leaving it off.
    return value === null || value === undefined ? undefined : value;
  }

  /**
   * Which of the catalogue's candidates this audience takes, and in what shape.
   *
   * The enumeration and the naming policy are `AgentCatalogue`'s — every audience walks the same registry and
   * holds one name per entry. What is MCP's own is only this: that every candidate is published unless a rule
   * refuses it, and that a published one becomes a tool, a prompt, and sometimes an addressable uri.
   */
  #collect(serializedSignal: Record<string, SerializedSignal>): {
    tools: McpExposedEndpoint[];
    prompts: McpExposedEndpoint[];
  } {
    const tools: McpExposedEndpoint[] = [];
    const prompts: McpExposedEndpoint[] = [];
    for (const candidate of AgentCatalogue.candidates(serializedSignal, {
      excludeSignals: this.#options.excludeSignals,
    })) {
      const item: McpExposedEndpoint = {
        refName: candidate.refName,
        key: candidate.key,
        endpoint: candidate.endpoint,
      };
      // Fail-closed and shared with the API explorer, so the reason an author reads is the rule that ran.
      const reason = mcpRefusalOf(item.endpoint, { readOnly: this.#options.readOnly });
      if (reason) {
        this.#catalogue.refuse(item.key, reason);
        continue;
      }
      if (!this.#catalogue.claim(item.key)) continue;
      if (item.endpoint.type === "prompt") {
        // A prompt is never addressable: `resources/read` resolves a template to a tool, and a prompt is not one.
        prompts.push(item);
        continue;
      }
      // Only the reads the framework generates have a uri shape — `#uriTemplate` knows those key shapes and
      // nothing else. A custom endpoint gets no template: falling back to the model's own published
      // `akan://x/{xId}` under a custom name, which `parse` then routed to *that* endpoint, so every read of the
      // advertised template answered somebody else or nothing at all.
      const uriTemplate = McpDocument.#addressable(candidate)
        ? McpDocument.#uriTemplate(item.refName, item.key, item.endpoint)
        : undefined;
      this.#byToolName.set(item.key, item);
      if (uriTemplate) this.#templates.set(item.key, uriTemplate);
      tools.push(item);
    }
    return { tools, prompts };
  }

  /**
   * Whether this candidate is one of the generated reads that has an `akan://` address.
   *
   * Only the list side of a slice is addressable; an insight is an aggregate with nothing to point a URI at, and a
   * custom endpoint has no generated key shape to build one from.
   */
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
    // A search arg is optional by construction, the way OpenAPI marks only path params required — the generated
    // `skip`/`limit`/`sort` are serialized without a nullable flag, so reading one here would demand them.
    const required = [...paramArgs, ...bodyArgs]
      .filter((arg) => isMcpDescribableArg(arg) && !arg.nullable)
      .map((arg) => arg.name);
    const outputSchema = this.#outputSchema(endpoint);
    return {
      name: key,
      ...this.#catalogue.entryTexts(refName, key),
      inputSchema: {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
        ...this.#defs(properties),
      },
      ...(outputSchema ? { outputSchema } : {}),
      annotations: mcpHintsOf(key, endpoint) satisfies McpToolAnnotations,
    };
  }

  /**
   * A prompt's arguments are a flat string map on the wire, so there is no schema to publish — only names,
   * descriptions and which ones must be filled. A `param` is a path segment and always required; a `search` is
   * the only way to declare an optional one.
   */
  #prompt({ refName, key, endpoint }: McpExposedEndpoint): McpPrompt {
    const args = endpoint.args.filter((arg) => arg.type === "param" || arg.type === "search");
    return {
      name: key,
      ...this.#catalogue.entryTexts(refName, key),
      ...(args.length
        ? {
            arguments: args.map((arg) => {
              const description = this.#options.resolveDescription?.(`${refName}.signal.${key}.arg.${arg.name}.desc`);
              return {
                name: arg.name,
                ...(description ? { description } : {}),
                required: arg.type === "param",
              };
            }),
          }
        : {}),
    };
  }

  #outputSchema(endpoint: SerializedEndpoint) {
    // A scalar return ships as text only: `structuredContent` must be an object, and declaring an `outputSchema`
    // obliges the server to produce a result that matches it.
    if (!endpoint.returns.modelType) return undefined;
    // Same obligation, and a nullable single return cannot keep it: the empty answer is `null`, which is not an
    // object and so cannot be `structuredContent` at all. A schema here would be a promise broken by the first
    // call that finds nothing — clients reject that harder than they miss a schema. A nullable *list* is fine,
    // because the wrapper `{ items: … }` is an object whatever rides inside it.
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
    // `readable` because this describes what comes back: `resolveReturn` strips every `hidden` and `secret` field,
    // so publishing their names here promises a property no answer will ever carry — and on a model like `user`,
    // the names alone (`password`, `accountId`) are the whole leak. Input keeps them: they are legal to send.
    return { ...schema, ...this.#defs(schema, { readable: true }) };
  }

  #defs(seed: unknown, { readable = false } = {}) {
    const defs = this.#schema.referencedSchemas(seed, this.#modelSchemas(readable));
    // A tool schema has to resolve on its own: the spec forbids dereferencing a `$ref` over the network, so every
    // model a tool mentions travels inside that tool rather than in a shared component section.
    return Object.keys(defs).length ? { $defs: defs } : {};
  }

  /**
   * Every registered model, built once per shape for the whole document. Narrowing runs twice per tool — input
   * schema and output schema — so deriving the full set inside each call rebuilt every model in the app 2N times.
   */
  #modelSchemas(readable: boolean) {
    if (!readable) {
      this.#allSchemas ??= this.#schema.allModelSchemas();
      return this.#allSchemas;
    }
    this.#readSchemas ??= this.#schema.allModelSchemas({ readable: true });
    return this.#readSchemas;
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
    if (key === `light${capitalize(refName)}`) return McpUriTemplate.light(refName);
    const listPrefix = `${refName}List`;
    if (!key.startsWith(listPrefix)) return undefined;
    const suffix = key.slice(listPrefix.length);
    // Pagination args are added by the client generator rather than the slice, so read them off the endpoint.
    // `param` args count too: a slice may declare required ones (`init().param("from", Date)`), and a template
    // that omits them addresses a read that can only fail. Both kinds travel as form-style query expansion,
    // which is exactly what `McpUriTemplate.parse` reads back.
    const argNames = endpoint.args
      .filter((arg) => (arg.type === "param" || arg.type === "search") && isMcpDescribableArg(arg))
      .map((arg) => arg.name);
    return McpUriTemplate.list(refName, suffix ? `${suffix.charAt(0).toLowerCase()}${suffix.slice(1)}` : "", argNames);
  }
}
