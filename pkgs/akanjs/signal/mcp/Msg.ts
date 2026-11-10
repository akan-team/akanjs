import { leakingFieldsOf, type MaskModel, mask } from "akanjs/constant";
import type { JsonSchema } from "../schema";
import { PromptError } from "./promptError";

export type PromptRole = "user" | "assistant";

export interface PromptAnnotations {
  audience?: PromptRole[];
  /** 0 = drop first, 1 = the point of the prompt; omitted = as droppable as any block; outside 0..1 throws. */
  priority?: number;
  /** ISO 8601. */
  lastModified?: string;
}

export interface PromptTextContent {
  type: "text";
  text: string;
  annotations?: PromptAnnotations;
}
export interface PromptBinaryContent {
  type: "image" | "audio";
  data: string;
  mimeType: string;
  annotations?: PromptAnnotations;
}
export interface PromptResourceLinkContent {
  type: "resource_link";
  uri: string;
  /** Required by the spec: `ResourceLink` extends `BaseMetadata`, whose `name` is not optional. */
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: PromptAnnotations;
}
export interface PromptEmbeddedResourceContent {
  type: "resource";
  resource: { uri: string; mimeType: string; text: string };
  annotations?: PromptAnnotations;
}
export type PromptContent =
  | PromptTextContent
  | PromptBinaryContent
  | PromptResourceLinkContent
  | PromptEmbeddedResourceContent;

export interface PromptMessage {
  role: PromptRole;
  content: PromptContent;
}

/** A bare string is wrapped into one user message. */
export type PromptResult = string | PromptMessage[];

/** Structural, so the framework does not depend on the lib's `File` model. */
export interface PromptFileSource {
  url: string;
  filename?: string;
  mimetype?: string;
}

export type PromptModel = MaskModel;

// A client parses `prompts/get` against a discriminated union, so a block missing one of these throws the whole reply.
const contentFields = new Map<string, readonly string[]>([
  ["text", ["text"]],
  ["image", ["data", "mimeType"]],
  ["audio", ["data", "mimeType"]],
  ["resource_link", ["uri", "name"]],
  ["resource", []],
]);

/**
 * Named `Msg` because `akanjs/dictionary` already exports a `msg`. Attachments carry the `user` role: an
 * assistant-role attachment would put the server's words in the model's mouth.
 */
export class Msg {
  /** JSON Schema of a prompt message for the OpenAPI document, since a prompt declares `Any` on the wire. */
  static readonly schema: JsonSchema = {
    type: "object",
    properties: {
      role: { type: "string", enum: ["user", "assistant"] },
      content: {
        oneOf: [...contentFields].map(([type, fields]) => ({
          type: "object",
          properties: {
            type: { const: type },
            ...Object.fromEntries(fields.map((field) => [field, { type: "string" }])),
            ...(type === "resource"
              ? {
                  resource: {
                    type: "object",
                    properties: { uri: { type: "string" }, mimeType: { type: "string" }, text: { type: "string" } },
                    required: ["uri"],
                  },
                }
              : {}),
            ...(type === "resource_link" ? { description: { type: "string" }, mimeType: { type: "string" } } : {}),
            annotations: {
              type: "object",
              properties: {
                audience: { type: "array", items: { type: "string", enum: ["user", "assistant"] } },
                priority: { type: "number", minimum: 0, maximum: 1 },
                lastModified: { type: "string", format: "date-time" },
              },
            },
          },
          required: ["type", ...fields, ...(type === "resource" ? ["resource"] : [])],
          additionalProperties: false,
        })),
      },
    },
    required: ["role", "content"],
    additionalProperties: false,
  };

  static user(text: string, annotations?: PromptAnnotations): PromptMessage {
    return { role: "user", content: Msg.#annotated({ type: "text", text }, annotations) };
  }

  static assistant(text: string, annotations?: PromptAnnotations): PromptMessage {
    return { role: "assistant", content: Msg.#annotated({ type: "text", text }, annotations) };
  }

  /**
   * Naming the `model` strips its `hidden`/`secret` fields; an unnamed payload that still carries populated ones
   * throws rather than being sent.
   */
  static resource(
    uri: string,
    value: unknown,
    { model, ...annotations }: { model?: PromptModel } & PromptAnnotations = {},
  ): PromptMessage {
    const payload = model ? Msg.mask(model, value) : Msg.#assertMasked(uri, value);
    return {
      role: "user",
      content: Msg.#annotated(
        { type: "resource", resource: { uri, mimeType: "application/json", text: JSON.stringify(payload) } },
        annotations,
      ),
    };
  }

  /**
   * Masks by the named model rather than the value's class, which a spread or a JSON round-trip loses. Unlike
   * `resolveReturn` it loads no relation: a populated one is masked in place, an id stays an id.
   */
  static mask(model: PromptModel, value: unknown): unknown {
    return mask(model, value);
  }

  static link(
    source: string | PromptFileSource,
    { name, description, ...annotations }: { name?: string; description?: string } & PromptAnnotations = {},
  ): PromptMessage {
    const file = typeof source === "string" ? null : source;
    const uri = typeof source === "string" ? source : source.url;
    return {
      role: "user",
      content: Msg.#annotated(
        {
          type: "resource_link",
          uri,
          name: Msg.#linkName(uri, name ?? file?.filename),
          ...(description ? { description } : {}),
          ...(file?.mimetype ? { mimeType: file.mimetype } : {}),
        },
        annotations,
      ),
    };
  }

  static #linkName(uri: string, name?: string) {
    if (name) return name;
    const segment = uri.split(/[?#]/)[0]?.split("/").filter(Boolean).pop();
    return segment ?? uri;
  }

  static image(data: string, mimeType: string, annotations?: PromptAnnotations): PromptMessage {
    return { role: "user", content: Msg.#annotated({ type: "image", data, mimeType }, annotations) };
  }

  static audio(data: string, mimeType: string, annotations?: PromptAnnotations): PromptMessage {
    return { role: "user", content: Msg.#annotated({ type: "audio", data, mimeType }, annotations) };
  }

  /** Fetched as this process, so a file behind a caller-scoped signed URL needs its bytes passed to `Msg.image`. */
  static async imageOf(file: PromptFileSource, annotations?: PromptAnnotations): Promise<PromptMessage> {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new PromptError("inlineFailed", `Failed to inline ${file.url}: ${response.status}`);
    const mimeType = file.mimetype ?? response.headers.get("content-type") ?? "application/octet-stream";
    return Msg.image(Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType, annotations);
  }

  // Throws only on a provable leak: a class declaring hidden/secret fields whose own keys hold them.
  static #assertMasked(uri: string, value: unknown) {
    for (const sample of Msg.#samples(value)) Msg.#assertSample(uri, sample);
    return value;
  }

  // A list's first element answers for it, and a plain object is looked into one level: `{ order, customer }` is
  // how a document usually travels, and its own constructor carries no field metadata.
  static #samples(value: unknown): Record<string, unknown>[] {
    const sample = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null | undefined;
    if (!sample || typeof sample !== "object") return [];
    if (sample.constructor !== Object) return [sample];
    return Object.values(sample).flatMap((nested) => {
      const inner = (Array.isArray(nested) ? nested[0] : nested) as Record<string, unknown> | null | undefined;
      return inner && typeof inner === "object" && inner.constructor !== Object ? [inner] : [];
    });
  }

  static #assertSample(uri: string, sample: Record<string, unknown>) {
    const model = sample.constructor as PromptModel | undefined;
    const leaking = model ? leakingFieldsOf(model, sample) : [];
    if (!leaking.length) return;
    throw new PromptError(
      "unmaskedResource",
      `Msg.resource("${uri}") embeds ${model?.name} with its hidden/secret fields populated: ${leaking.join(", ")}. Name the model so they are stripped — Msg.resource(uri, value, { model: cnst.${model?.name} }), or Msg.mask(cnst.${model?.name}, value) for one piece of an assembled payload.`,
    );
  }

  // `annotations: {}` reads to a client as a deliberate "no audience, no priority", so an empty one is dropped. An
  // out-of-range priority throws instead of clamping: a client may ignore the field, so a clamp reorders silently.
  static #annotated<T extends PromptContent>(content: T, annotations?: PromptAnnotations): T {
    if (!annotations || !Object.keys(annotations).length) return content;
    const { priority } = annotations;
    if (priority !== undefined && (priority < 0 || priority > 1))
      throw new PromptError("invalidPrompt", `Prompt annotation priority must be between 0 and 1, got ${priority}`);
    return { ...content, annotations };
  }

  /** The only runtime check on a prompt's value: `prompt()` carries `Any`, so nothing upstream inspects it. */
  static normalize(value: unknown): PromptMessage[] {
    if (typeof value === "string") return [Msg.user(value)];
    if (!Array.isArray(value))
      throw new PromptError("invalidPrompt", `A prompt must return a string or PromptMessage[], got ${typeof value}`);
    value.forEach((message, idx) => {
      Msg.#assertMessage(message, idx);
    });
    return value as PromptMessage[];
  }

  static #assertMessage(message: unknown, idx: number) {
    const { role, content } = (message ?? {}) as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant")
      throw new PromptError("invalidPrompt", `Prompt message ${idx} has role "${String(role)}"`);
    const block = (content ?? {}) as Record<string, unknown>;
    const fields = typeof block.type === "string" ? contentFields.get(block.type) : undefined;
    if (!fields)
      throw new PromptError("invalidPrompt", `Prompt message ${idx} has content type "${String(block.type)}"`);
    const missing = fields.filter((field) => typeof block[field] !== "string" || !block[field]);
    if (missing.length)
      throw new PromptError("invalidPrompt", `Prompt message ${idx} (${block.type}) is missing ${missing.join(", ")}`);
    if (block.type === "resource") Msg.#assertResource(block.resource, idx);
    Msg.#assertPriority(block.annotations, idx);
  }

  // The spec lets a resource carry its payload as `text` or as a base64 `blob`.
  static #assertResource(resource: unknown, idx: number) {
    const { uri, text, blob } = (resource ?? {}) as Record<string, unknown>;
    if (typeof uri !== "string" || !uri)
      throw new PromptError("invalidPrompt", `Prompt message ${idx} (resource) is missing resource.uri`);
    if (typeof text !== "string" && typeof blob !== "string")
      throw new PromptError(
        "invalidPrompt",
        `Prompt message ${idx} (resource) has neither resource.text nor resource.blob`,
      );
  }

  static #assertPriority(annotations: unknown, idx: number) {
    const priority = (annotations as { priority?: unknown } | null)?.priority;
    if (priority === undefined) return;
    if (typeof priority !== "number" || priority < 0 || priority > 1)
      throw new PromptError(
        "invalidPrompt",
        `Prompt message ${idx} has annotations.priority "${String(priority)}", not between 0 and 1`,
      );
  }
}
