import { leakingFieldsOf, type MaskModel, mask } from "akanjs/constant";
import type { JsonSchema } from "../schema";

export type PromptRole = "user" | "assistant";

/**
 * What a client may do with a block when it cannot keep all of them.
 *
 * `priority` is the field that matters here: a prompt this server assembles is often mostly context — a document
 * embedded beside the one line asking for something — and a client with a full window drops blocks by this number
 * rather than by position. Leaving it off means every block is equally droppable, so the instruction can go and
 * the attachment stay.
 */
export interface PromptAnnotations {
  /** Who the block is for. A note meant only for the model is `["assistant"]`, so a UI need not render it. */
  audience?: PromptRole[];
  /** 0 is "drop this first", 1 is "this is the point of the prompt". Anything outside the range is refused. */
  priority?: number;
  /** ISO 8601. Lets a client tell a re-fetched resource from the copy it already holds. */
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

/** What a `prompt()` exec may return. A bare string is the 80% case and is wrapped into one user message. */
export type PromptResult = string | PromptMessage[];

/** Enough of the `File` model to link or inline it, structural so the framework does not depend on the lib. */
export interface PromptFileSource {
  url: string;
  filename?: string;
  mimetype?: string;
}

/**
 * A model class, named by the caller so an attachment can be masked by what it *is* rather than by what it still
 * carries at runtime. The same model any other audience masks by — see `mask` in `akanjs/constant`.
 */
export type PromptModel = MaskModel;

/**
 * The string fields each block type must carry, and the set of legal types at once.
 *
 * A client parses `prompts/get` against a discriminated union, so a block missing one of these is not a thinner
 * block — it matches no member and the whole reply throws on the client. `resource` carries a nested shape instead
 * and is checked on its own.
 */
const contentFields = new Map<string, readonly string[]>([
  ["text", ["text"]],
  ["image", ["data", "mimeType"]],
  ["audio", ["data", "mimeType"]],
  ["resource_link", ["uri", "name"]],
  ["resource", []],
]);

/**
 * Builds the messages a `prompt()` endpoint returns.
 *
 * Named `Msg` rather than `msg` because `akanjs/dictionary` already exports a `msg` for toasts.
 *
 * Every attachment builder carries the `user` role. Content the server assembles is context handed *to* the
 * model, which is what the user role means; an assistant-role attachment would be the server putting words in the
 * model's mouth. That is only meaningful for few-shot text, which `Msg.assistant` covers.
 */
export class Msg {
  /**
   * What every `prompt()` route answers with, as JSON Schema, for the app's OpenAPI document.
   *
   * A prompt declares `Any` on the wire, so the generated response schema was `{}` — a documented `GET` whose body
   * the document could not describe, which is half of the agreement the HTTP route was mounted for. The shape is
   * fixed by the protocol rather than by the endpoint, so it is written once, here: the block types and the fields
   * each must carry come off `contentFields`, so a type added to one cannot describe itself out of the other.
   */
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
            // The two shapes `contentFields` does not describe: a nested payload it checks separately, and fields
            // that are optional and so are not in a map of what a block must carry.
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
   * Embeds the value itself. The payload travels in the prompt, so prefer `link` for anything large.
   *
   * Name the model it is an instance of and the `hidden`/`secret` fields are stripped before it goes out:
   * `Msg.resource(uri, order, { model: cnst.Order })`. A payload you assembled yourself needs no model and is
   * embedded as given — but one that still carries a document's secret fields is refused rather than sent, so
   * the rule is the same either way: a document travels masked, or it does not travel.
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
   * Strips what a model marks `hidden` or `secret`, by the model the caller names rather than by the one the
   * value happens to still carry.
   *
   * That distinction is the whole fix. A check that reads the class off the value can only mask what arrives as an
   * instance, so a `{ ...doc }` spread, a `toJSON()`, or a round-trip through `JSON.stringify` reached the wire
   * with the metadata already gone and nothing could be done about it. A named model is metadata the value cannot
   * lose, so a hydrated document and a plain object copied out of one mask identically.
   *
   * This is the field half of `resolveReturn` and deliberately not the whole of it. That one also loads every
   * relation it walks past, which is right for a query's return value and wrong for an attachment, where it would
   * turn embedding one document into a fan of queries nobody asked for. So a populated relation is masked in
   * place and one that is still an id is left as an id.
   *
   * Public because a payload can be an assembly of several documents — `{ order, customer }` names no single
   * model, so each piece is masked on its way in.
   *
   * Returns `unknown` rather than the argument's type, because what comes back is missing fields that type still
   * promises. The value's only destination is a JSON payload, so nothing downstream wanted the type anyway.
   */
  static mask(model: PromptModel, value: unknown): unknown {
    return mask(model, value);
  }

  /**
   * Points at something without paying for it. The client decides whether to fetch, and skips what it already
   * holds — so a prompt that references twenty documents costs twenty URIs rather than twenty payloads.
   */
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

  /**
   * Never absent, because the spec's `name` is required and a client SDK parses the block against a union it then
   * matches nothing in — a link with no name is not a nameless link, it is a `prompts/get` that throws.
   *
   * The last path segment is the fallback rather than the whole URI: for `akan://order/42` it is the identifier a
   * person reading the list would use, and for a file URL it is the filename we would have used anyway.
   */
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

  /**
   * Inlines a file as base64, costing roughly 1.33× its bytes in the prompt. Worth it only when the client
   * cannot fetch the URL itself — a public asset is cheaper as `Msg.link`. Fetched as this process, so a file
   * behind a caller-scoped signed URL needs its bytes passed to `Msg.image` instead.
   */
  static async imageOf(file: PromptFileSource, annotations?: PromptAnnotations): Promise<PromptMessage> {
    const response = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Failed to inline ${file.url}: ${response.status}`);
    const mimeType = file.mimetype ?? response.headers.get("content-type") ?? "application/octet-stream";
    return Msg.image(Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType, annotations);
  }

  /**
   * Refuses an undeclared payload that still carries a document's secret fields, rather than sending it.
   *
   * A warning was the older answer, on the reasoning that masking off the value's own class would reach only the
   * payloads that still had one — half masked, half not, and an author who believes prompts are masked is worse
   * off on the unmasked half. `mask` removes that objection by taking the model as an argument instead, so there
   * is now a way to be right about every payload and this is the shape that did not take it.
   *
   * It throws only where it can prove a leak: a value whose class says those fields exist and whose own keys say
   * they are populated. A `Light<Model>`, or anything assembled by hand, declares no such fields and passes.
   */
  static #assertMasked(uri: string, value: unknown) {
    for (const sample of Msg.#samples(value)) Msg.#assertSample(uri, sample);
    return value;
  }

  /**
   * The values a refusal could be about: the payload, and — when the payload is a plain object — one level into it.
   *
   * A list is homogeneous in practice, so its first element answers for it; walking every element to decide
   * whether to refuse would cost more than the thing it is checking.
   *
   * The level down is what makes the common assembly reachable. A document rarely travels alone — it arrives as
   * `{ order }` or `{ order, customer }` — and a plain object's own constructor carries no field metadata, so a
   * check that stopped at the outer value saw neither the wrapper (which has nothing to show) nor what it wrapped.
   * It stops there rather than recursing: a payload nested two deep is one somebody assembled deliberately, and no
   * depth reaches metadata a spread has already thrown away.
   */
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
    throw new Error(
      `Msg.resource("${uri}") embeds ${model?.name} with its hidden/secret fields populated: ${leaking.join(", ")}. Name the model so they are stripped — Msg.resource(uri, value, { model: cnst.${model?.name} }), or Msg.mask(cnst.${model?.name}, value) for one piece of an assembled payload.`,
    );
  }

  /**
   * An empty annotation object is dropped rather than emitted: a block carrying `annotations: {}` reads to a
   * client as a deliberate "no audience, no priority", which is not the same as saying nothing.
   *
   * A `priority` outside 0..1 throws instead of being clamped. The spec's range is what gives the number its
   * meaning, and a client that meets 5 is free to ignore the field entirely — so a silent clamp would turn a
   * typo into blocks dropped in an order nobody chose.
   */
  static #annotated<T extends PromptContent>(content: T, annotations?: PromptAnnotations): T {
    if (!annotations || !Object.keys(annotations).length) return content;
    const { priority } = annotations;
    if (priority !== undefined && (priority < 0 || priority > 1))
      throw new Error(`Prompt annotation priority must be between 0 and 1, got ${priority}`);
    return { ...content, annotations };
  }

  /**
   * The one runtime check on a prompt's return value. `prompt()` carries `Any` on the wire so the signal
   * pipeline hands the value back untouched — nothing upstream would notice a malformed message, and the client
   * would receive it as a valid prompt.
   */
  static normalize(value: unknown): PromptMessage[] {
    if (typeof value === "string") return [Msg.user(value)];
    if (!Array.isArray(value)) throw new Error(`A prompt must return a string or PromptMessage[], got ${typeof value}`);
    value.forEach((message, idx) => {
      Msg.#assertMessage(message, idx);
    });
    return value as PromptMessage[];
  }

  /**
   * Checked down to the fields, not just the discriminator: the shapes this framework can build wrongly are all
   * inside a block a client would then reject, and a check that stops at `content.type` cannot see any of them.
   */
  static #assertMessage(message: unknown, idx: number) {
    const { role, content } = (message ?? {}) as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") throw new Error(`Prompt message ${idx} has role "${String(role)}"`);
    const block = (content ?? {}) as Record<string, unknown>;
    const fields = typeof block.type === "string" ? contentFields.get(block.type) : undefined;
    if (!fields) throw new Error(`Prompt message ${idx} has content type "${String(block.type)}"`);
    const missing = fields.filter((field) => typeof block[field] !== "string" || !block[field]);
    if (missing.length) throw new Error(`Prompt message ${idx} (${block.type}) is missing ${missing.join(", ")}`);
    if (block.type === "resource") Msg.#assertResource(block.resource, idx);
    Msg.#assertPriority(block.annotations, idx);
  }

  /** The one nested block, and the one whose payload may arrive as either `text` or a base64 `blob`. */
  static #assertResource(resource: unknown, idx: number) {
    const { uri, text, blob } = (resource ?? {}) as Record<string, unknown>;
    if (typeof uri !== "string" || !uri) throw new Error(`Prompt message ${idx} (resource) is missing resource.uri`);
    if (typeof text !== "string" && typeof blob !== "string")
      throw new Error(`Prompt message ${idx} (resource) has neither resource.text nor resource.blob`);
  }

  /** Same range the builders enforce, for a message an author assembled without them. */
  static #assertPriority(annotations: unknown, idx: number) {
    const priority = (annotations as { priority?: unknown } | null)?.priority;
    if (priority === undefined) return;
    if (typeof priority !== "number" || priority < 0 || priority > 1)
      throw new Error(`Prompt message ${idx} has annotations.priority "${String(priority)}", not between 0 and 1`);
  }
}
