import { type Cls, FIELD_META, getNonArrayModel, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { type ConstantCls, type ConstantField, ConstantRegistry, type ConstantType } from "akanjs/constant";
import type { SerializedArg, SerializedReturns } from "../types";

export type JsonSchema = Record<string, unknown>;

export interface JsonSchemaBuilderOptions {
  /**
   * Where a model `$ref` points. OpenAPI collects every model under `components/schemas`, while MCP requires each
   * tool schema to resolve on its own and so embeds its models in a per-schema `$defs`.
   */
  refPrefix?: string;
  /**
   * How a nullable schema is spelled. `anyOf` with a null branch is the OpenAPI habit and the default; `type` merges
   * `"null"` into a schema that has one plain `type` (and lists `null` in its `enum`, which would otherwise still
   * refuse it) — the shorter form a listing that is re-sent to every agent is paid for by the byte.
   */
  nullable?: "anyOf" | "type";
  /**
   * Which shape a primitive is published as. `wire` is what an HTTP body carries, which is what an API contract
   * describes. `agent` is what an agent reads and writes, on both sides of a call: a primitive's `agent.schema`
   * when it declares one, its wire shape otherwise.
   */
  face?: JsonSchemaFace;
}

export type JsonSchemaFace = "wire" | "agent";

export type JsonSchemaRelations = "inline" | "id" | "named";

export interface JsonSchemaModelOptions {
  /**
   * Drops `hidden`, `secret`, and `visual` fields. `SignalContext.resolveReturn` strips the first two from every
   * response, so naming them describes a value the caller can never read — and on a model like `user` the names
   * are themselves the leak: `password`, `accountId`, `phone` published as readable properties of the model. This
   * is the one place a field the framework blocks on every value path is still visible, so it is scoped to schemas
   * that describe a *response*. A request body is a different shape and legitimately carries all three.
   *
   * `visual` is dropped here because it is dropped from the payload an AI caller receives, and a schema that
   * promises a field the value omits is worse than one that never named it: a non-optional visual field would be
   * listed `required` and a validating client would refuse the whole result.
   */
  readable?: boolean;
  /**
   * How a field holding another database model is described. `inline` follows the `$ref`, which is right where
   * schemas share a component section. `id` is what a request body carries: `serialize` sends a relation as its id,
   * so a schema showing the whole related object asks the caller for a shape the server never reads. `named` is for
   * a response: the nested document becomes `{ type: "object" }` carrying its model name, so the returned model
   * keeps every field of its own and stops dragging its relations' closures into each copy. An embedded scalar has
   * no tool of its own and stays inline under either.
   */
  relations?: JsonSchemaRelations;
  /**
   * Whether an id carries the 24-hex `pattern`. Kept on a top-level argument, where it is read once; dropped inside
   * a per-tool `$defs`, where it would repeat on every id field of every copy.
   */
  idPattern?: boolean;
}

/**
 * Turns serialized signal metadata and Akan constants into JSON Schema (2020-12 by default, which is also what
 * OpenAPI 3.1 uses). One builder per output dialect target — `new` it at the call site, it holds no shared state.
 */
export class JsonSchemaBuilder {
  readonly #refPrefix: string;
  readonly #nullableForm: "anyOf" | "type";
  readonly #face: JsonSchemaFace;
  constructor({
    refPrefix = "#/components/schemas/",
    nullable = "anyOf",
    face = "wire",
  }: JsonSchemaBuilderOptions = {}) {
    this.#refPrefix = refPrefix;
    this.#nullableForm = nullable;
    this.#face = face;
  }

  arg(arg: SerializedArg): JsonSchema {
    const schema = arg.oneOf
      ? JsonSchemaBuilder.#inlineEnum(arg.oneOf)
      : arg.enum
        ? this.#enum(arg.enum)
        : this.#ref(arg.refName, arg.modelType);
    return this.#nullable(JsonSchemaBuilder.#arrayed(schema, arg.arrDepth ?? 0), !!arg.nullable);
  }

  upload(arg: SerializedArg): JsonSchema {
    const fileSchema = { type: "string", format: "binary" };
    return this.#nullable(JsonSchemaBuilder.#arrayed(fileSchema, arg.arrDepth ?? 0), !!arg.nullable);
  }

  returns(returns: SerializedReturns): JsonSchema {
    return this.#nullable(
      JsonSchemaBuilder.#arrayed(this.#ref(returns.refName, returns.modelType), returns.arrDepth ?? 0),
      !!returns.nullable,
    );
  }

  model(modelRef: ConstantCls, options: JsonSchemaModelOptions = {}): JsonSchema {
    const { readable = false } = options;
    const fields = (modelRef as { [FIELD_META]?: Record<string, ConstantField> })[FIELD_META] ?? {};
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(fields)) {
      const props = field.getProps();
      if (readable && (props.fieldType === "hidden" || props.fieldType === "secret" || props.visual)) continue;
      properties[key] = this.#field(field, options);
      if (!props.nullable) required.push(key);
    }
    return {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    };
  }

  /** Every registered model, keyed by schema name. Callers narrow this with `referencedSchemas`. */
  allModelSchemas(options: JsonSchemaModelOptions = {}): Record<string, JsonSchema> {
    const schemas: Record<string, JsonSchema> = {};
    for (const [, database] of ConstantRegistry.database.entries()) {
      [database.input, database.object, database.full, database.light, database.insight].forEach((modelRef) => {
        schemas[ConstantRegistry.getModelName(modelRef)] = this.model(modelRef, options);
      });
    }
    for (const [, scalar] of ConstantRegistry.scalar.entries()) {
      schemas[ConstantRegistry.getModelName(scalar.model)] = this.model(scalar.model, options);
    }
    return schemas;
  }

  /**
   * The models `seed` references, plus everything those transitively reference, sorted by name.
   *
   * `allSchemas` is derived from the registry, so a caller that narrows many seeds against the same registry —
   * MCP builds one per tool schema and one per output schema — passes its own copy rather than rebuilding every
   * registered model each time. Holding it here instead would make this builder stateful, and the one in
   * `openapi.ts` lives at module scope for the life of the process.
   */
  referencedSchemas(seed: unknown, allSchemas: Record<string, JsonSchema> = this.allModelSchemas()) {
    const referencedNames = this.collectRefNames(seed);
    const pending = [...referencedNames];
    for (let idx = 0; idx < pending.length; idx++) {
      const schemaName = pending[idx];
      if (!schemaName) continue;
      const schema = allSchemas[schemaName];
      if (!schema) continue;
      for (const nestedName of this.collectRefNames(schema)) {
        if (referencedNames.has(nestedName)) continue;
        referencedNames.add(nestedName);
        pending.push(nestedName);
      }
    }
    return Object.fromEntries(
      [...referencedNames]
        .sort((a, b) => a.localeCompare(b))
        .flatMap((name) => (allSchemas[name] ? ([[name, allSchemas[name]]] as const) : [])),
    );
  }

  collectRefNames(value: unknown): Set<string> {
    const refs = new Set<string>();
    const visit = (current: unknown) => {
      if (!current || typeof current !== "object") return;
      if (Array.isArray(current)) {
        current.forEach(visit);
        return;
      }
      const record = current as Record<string, unknown>;
      if (typeof record.$ref === "string") {
        const name = this.#refName(record.$ref);
        if (name) refs.add(name);
      }
      Object.values(record).forEach(visit);
    };
    visit(value);
    return refs;
  }

  // Prefix matching rather than a compiled pattern: `#/$defs/` contains `$`, which a naive `new RegExp` would
  // read as end-of-input and silently match nothing.
  #refName(ref: string): string | undefined {
    if (!ref.startsWith(this.#refPrefix)) return undefined;
    const name = ref.slice(this.#refPrefix.length);
    return name.length ? name : undefined;
  }

  #ref(refName: string, modelType?: ConstantType): JsonSchema {
    if (!modelType) return JsonSchemaBuilder.primitive(refName, { face: this.#face });
    const modelRef = ConstantRegistry.getModelRef(refName, modelType);
    return { $ref: `${this.#refPrefix}${ConstantRegistry.getModelName(modelRef as Cls)}` };
  }

  #modelRef(modelRef: Cls, { relations = "inline", idPattern = true }: JsonSchemaModelOptions = {}): JsonSchema {
    if (PrimitiveRegistry.has(modelRef))
      return JsonSchemaBuilder.primitive(PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar), {
        idPattern,
        face: this.#face,
      });
    if (relations !== "inline" && !ConstantRegistry.isScalar(modelRef as ConstantCls)) {
      if (relations === "id") return JsonSchemaBuilder.primitive("ID", { idPattern });
      return { type: "object", description: ConstantRegistry.getModelName(modelRef) };
    }
    return { $ref: `${this.#refPrefix}${ConstantRegistry.getModelName(modelRef)}` };
  }

  #field(field: ConstantField, options: JsonSchemaModelOptions): JsonSchema {
    const props = field.getProps();
    const schema = props.enum ? JsonSchemaBuilder.#inlineEnum([...props.enum.values]) : this.#fieldRef(props, options);
    return this.#nullable(JsonSchemaBuilder.#arrayed(schema, props.arrDepth), props.nullable);
  }

  #fieldRef(props: ReturnType<ConstantField["getProps"]>, options: JsonSchemaModelOptions): JsonSchema {
    if (props.isMap) {
      const [valueRef, valueArrDepth] = getNonArrayModel(props.of as Cls | Cls[]);
      // `serialize` sends a map's model values whole rather than as ids, so a request schema keeps them inline.
      const valueOptions = options.relations === "id" ? { ...options, relations: "inline" as const } : options;
      return {
        type: "object",
        additionalProperties: JsonSchemaBuilder.#arrayed(this.#modelRef(valueRef as Cls, valueOptions), valueArrDepth),
      };
    }
    return this.#modelRef(props.modelRef as Cls, options);
  }

  #enum(refName: string): JsonSchema {
    const enumRef = ConstantRegistry.enum.get(refName);
    if (!enumRef) return { type: "string", "x-akan-enum": refName };
    return JsonSchemaBuilder.#inlineEnum([...enumRef.values]);
  }

  static primitive(
    refName: string,
    { idPattern = true, face = "wire" }: Pick<JsonSchemaModelOptions, "idPattern"> & { face?: JsonSchemaFace } = {},
  ): JsonSchema {
    const scalar = PrimitiveRegistry.hasName(refName) ? PrimitiveRegistry.get(refName) : null;
    const declared = (face === "agent" ? scalar?.agent?.schema : undefined) ?? scalar?.jsonSchema;
    if (declared) return { ...declared };
    switch (refName) {
      case "Boolean":
        return { type: "boolean" };
      case "Date":
        return { type: "string", format: "date-time" };
      case "Float":
        return { type: "number" };
      case "ID":
        return idPattern ? { type: "string", pattern: "^[0-9a-fA-F]{24}$" } : { type: "string" };
      case "Int":
        return { type: "integer" };
      case "Upload":
        return { type: "string", format: "binary" };
      case "Binary":
        return { type: "string", contentEncoding: "base64" };
      case "Any":
        return {};
      default:
        return { type: "string" };
    }
  }

  static #inlineEnum(values: unknown[]): JsonSchema {
    return {
      type: values.every((value) => typeof value === "number") ? "number" : "string",
      enum: values,
    };
  }

  static #arrayed(schema: JsonSchema, arrDepth: number): JsonSchema {
    let current = schema;
    for (let idx = 0; idx < arrDepth; idx++) current = { type: "array", items: current };
    return current;
  }

  #nullable(schema: JsonSchema, nullable: boolean): JsonSchema {
    if (!nullable) return schema;
    // Only a schema with one plain `type` can carry `"null"` in it: a `$ref` has no type of its own, and an `enum`
    // must list `null` too or the type array admits what the value list still refuses.
    if (this.#nullableForm === "type" && typeof schema.type === "string" && !("$ref" in schema)) {
      const merged = { ...schema, type: [schema.type, "null"] };
      return Array.isArray(schema.enum) ? { ...merged, enum: [...schema.enum, null] } : merged;
    }
    return { anyOf: [schema, { type: "null" }] };
  }
}
