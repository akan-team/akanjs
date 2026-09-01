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
}

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
}

/**
 * Turns serialized signal metadata and Akan constants into JSON Schema (2020-12 by default, which is also what
 * OpenAPI 3.1 uses). One builder per output dialect target — `new` it at the call site, it holds no shared state.
 */
export class JsonSchemaBuilder {
  readonly #refPrefix: string;
  constructor({ refPrefix = "#/components/schemas/" }: JsonSchemaBuilderOptions = {}) {
    this.#refPrefix = refPrefix;
  }

  arg(arg: SerializedArg): JsonSchema {
    const schema = arg.oneOf
      ? JsonSchemaBuilder.#inlineEnum(arg.oneOf)
      : arg.enum
        ? this.#enum(arg.enum)
        : this.#ref(arg.refName, arg.modelType);
    return JsonSchemaBuilder.#nullable(JsonSchemaBuilder.#arrayed(schema, arg.arrDepth ?? 0), !!arg.nullable);
  }

  upload(arg: SerializedArg): JsonSchema {
    const fileSchema = { type: "string", format: "binary" };
    return JsonSchemaBuilder.#nullable(JsonSchemaBuilder.#arrayed(fileSchema, arg.arrDepth ?? 0), !!arg.nullable);
  }

  returns(returns: SerializedReturns): JsonSchema {
    return JsonSchemaBuilder.#nullable(
      JsonSchemaBuilder.#arrayed(this.#ref(returns.refName, returns.modelType), returns.arrDepth ?? 0),
      !!returns.nullable,
    );
  }

  model(modelRef: ConstantCls, { readable = false }: JsonSchemaModelOptions = {}): JsonSchema {
    const fields = (modelRef as { [FIELD_META]?: Record<string, ConstantField> })[FIELD_META] ?? {};
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(fields)) {
      const props = field.getProps();
      if (readable && (props.fieldType === "hidden" || props.fieldType === "secret" || props.visual)) continue;
      properties[key] = this.#field(field);
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
    if (!modelType) return JsonSchemaBuilder.primitive(refName);
    const modelRef = ConstantRegistry.getModelRef(refName, modelType);
    return { $ref: `${this.#refPrefix}${ConstantRegistry.getModelName(modelRef as Cls)}` };
  }

  #modelRef(modelRef: Cls): JsonSchema {
    if (PrimitiveRegistry.has(modelRef))
      return JsonSchemaBuilder.primitive(PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar));
    return { $ref: `${this.#refPrefix}${ConstantRegistry.getModelName(modelRef)}` };
  }

  #field(field: ConstantField): JsonSchema {
    const props = field.getProps();
    const schema = props.enum ? JsonSchemaBuilder.#inlineEnum([...props.enum.values]) : this.#fieldRef(props);
    return JsonSchemaBuilder.#nullable(JsonSchemaBuilder.#arrayed(schema, props.arrDepth), props.nullable);
  }

  #fieldRef(props: ReturnType<ConstantField["getProps"]>): JsonSchema {
    if (props.isMap) {
      const [valueRef, valueArrDepth] = getNonArrayModel(props.of as Cls | Cls[]);
      return {
        type: "object",
        additionalProperties: JsonSchemaBuilder.#arrayed(this.#modelRef(valueRef as Cls), valueArrDepth),
      };
    }
    return this.#modelRef(props.modelRef as Cls);
  }

  #enum(refName: string): JsonSchema {
    const enumRef = ConstantRegistry.enum.get(refName);
    if (!enumRef) return { type: "string", "x-akan-enum": refName };
    return JsonSchemaBuilder.#inlineEnum([...enumRef.values]);
  }

  static primitive(refName: string): JsonSchema {
    switch (refName) {
      case "Boolean":
        return { type: "boolean" };
      case "Date":
        return { type: "string", format: "date-time" };
      case "Float":
        return { type: "number" };
      case "ID":
        return { type: "string", pattern: "^[0-9a-fA-F]{24}$" };
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

  static #nullable(schema: JsonSchema, nullable: boolean): JsonSchema {
    return nullable ? { anyOf: [schema, { type: "null" }] } : schema;
  }
}
