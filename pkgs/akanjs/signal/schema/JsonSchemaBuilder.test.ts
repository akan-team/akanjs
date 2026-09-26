import { describe, expect, test } from "bun:test";
import {
  CLIENT_VALUE,
  enumOf,
  Int,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
  Upload,
} from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { JsonSchemaBuilder } from "./JsonSchemaBuilder";

// The subclass form is what registers the enum: `isEnum` walks two prototype hops, so a bare
// `const X = enumOf(...)` is never found by `ConstantRegistry.enum`.
class SchemaRole extends enumOf("schemaRole", ["admin", "user"] as const) {}

class SchemaTagInput extends via((field) => ({ label: field(String) })) {}
class SchemaTagObject extends via(SchemaTagInput, (field) => ({ weight: field(Int, { default: 0 }) })) {}
class LightSchemaTag extends via(SchemaTagObject, ["label"] as const, () => ({})) {}
class SchemaTag extends via(SchemaTagObject, LightSchemaTag, () => ({})) {}
class SchemaTagInsight extends via(SchemaTag, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaTag",
  SchemaTagInput,
  SchemaTagObject,
  SchemaTag,
  LightSchemaTag,
  SchemaTagInsight,
  {},
);

class SchemaPostInput extends via((field) => ({
  title: field(String),
  role: field(SchemaRole, { default: "user" }),
  tag: field(SchemaTag).optional(),
  aliases: field([String]),
  scores: field(Map, { of: Int }),
})) {}
class SchemaPostObject extends via(SchemaPostInput, (field) => ({ views: field(Int, { default: 0 }) })) {}
class LightSchemaPost extends via(SchemaPostObject, ["title"] as const, () => ({})) {}
class SchemaPost extends via(SchemaPostObject, LightSchemaPost, () => ({})) {}
class SchemaPostInsight extends via(SchemaPost, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaPost",
  SchemaPostInput,
  SchemaPostObject,
  SchemaPost,
  LightSchemaPost,
  SchemaPostInsight,
  { SchemaRole },
);

class SchemaVaultInput extends via((field) => ({
  label: field(String),
  password: field.secret(String).optional(),
  internalPath: field.hidden(String).optional(),
  preview: field.visual(String).optional(),
})) {}
class SchemaVaultObject extends via(SchemaVaultInput, () => ({})) {}
class LightSchemaVault extends via(SchemaVaultObject, ["label"] as const, () => ({})) {}
class SchemaVault extends via(SchemaVaultObject, LightSchemaVault, () => ({})) {}
class SchemaVaultInsight extends via(SchemaVault, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaVault",
  SchemaVaultInput,
  SchemaVaultObject,
  SchemaVault,
  LightSchemaVault,
  SchemaVaultInsight,
  {},
);

describe("JsonSchemaBuilder", () => {
  const schema = new JsonSchemaBuilder();

  test("maps every Akan primitive to its JSON Schema form", () => {
    expect(JsonSchemaBuilder.primitive("Boolean")).toEqual({ type: "boolean" });
    expect(JsonSchemaBuilder.primitive("Date")).toEqual({ type: "string", format: "date-time" });
    expect(JsonSchemaBuilder.primitive("Float")).toEqual({ type: "number" });
    expect(JsonSchemaBuilder.primitive("Int")).toEqual({ type: "integer" });
    expect(JsonSchemaBuilder.primitive("ID")).toEqual({ type: "string", pattern: "^[0-9a-fA-F]{24}$" });
    expect(JsonSchemaBuilder.primitive("Upload")).toEqual({ type: "string", format: "binary" });
    expect(JsonSchemaBuilder.primitive("Any")).toEqual({});
    expect(JsonSchemaBuilder.primitive("String")).toEqual({ type: "string" });
    expect(JsonSchemaBuilder.primitive("Unregistered")).toEqual({ type: "string" });
  });

  test("wraps an arg in array depth then nullability, and inlines enum values", () => {
    expect(schema.arg({ type: "search", name: "tags", refName: "String", arrDepth: 2, nullable: true })).toEqual({
      anyOf: [{ type: "array", items: { type: "array", items: { type: "string" } } }, { type: "null" }],
    });
    expect(schema.arg({ type: "search", name: "role", refName: "String", enum: "schemaRole" })).toEqual({
      type: "string",
      enum: ["admin", "user"],
    });
    // `oneOf` is a fixed list an arg carries without a registered enum behind it — the root slice's query keys.
    expect(schema.arg({ type: "search", name: "queryKey", refName: "String", oneOf: ["any", "byAuthor"] })).toEqual({
      type: "string",
      enum: ["any", "byAuthor"],
    });
  });

  test("falls back to an annotated string for an enum that is not registered", () => {
    expect(schema.arg({ type: "search", name: "role", refName: "String", enum: "missingEnum" })).toEqual({
      type: "string",
      "x-akan-enum": "missingEnum",
    });
  });

  test("marks only non-nullable fields required and describes map fields by their value type", () => {
    expect(schema.allModelSchemas().SchemaPostInput).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["title", "role", "aliases", "scores"],
      properties: {
        title: { type: "string" },
        role: { type: "string", enum: ["admin", "user"] },
        tag: { anyOf: [{ $ref: "#/components/schemas/SchemaTag" }, { type: "null" }] },
        aliases: { type: "array", items: { type: "string" } },
        scores: { type: "object", additionalProperties: { type: "integer" } },
      },
    });
  });

  test("drops hidden, secret and visual fields only where the schema describes a response", () => {
    // `SignalContext.resolveReturn` strips the first two from every response, so naming them describes a property
    // no answer carries — and on a real model the names are the leak. A request body carries all three
    // legitimately, so the default keeps them and only the caller that publishes a *return* shape asks for this.
    const keys = (value: unknown) => Object.keys((value as { properties: object }).properties);
    const vaultInput = SchemaVaultInput as unknown as Parameters<typeof schema.model>[0];
    expect(keys(schema.model(vaultInput))).toEqual(["label", "password", "internalPath", "preview"]);
    expect(keys(schema.model(vaultInput, { readable: true }))).toEqual(["label"]);
    expect(keys(schema.allModelSchemas({ readable: true }).SchemaVault)).not.toContain("password");
    expect(keys(schema.allModelSchemas().SchemaVault)).toContain("password");
  });

  test("a visual field is absent from the readable schema, since it is absent from the value", () => {
    // A schema that promises a field the payload omits is worse than one that never named it: a non-optional
    // visual field would be listed `required` and a validating client would refuse the whole result.
    const vaultInput = SchemaVaultInput as unknown as Parameters<typeof schema.model>[0];
    const readable = schema.model(vaultInput, { readable: true }) as { properties: object };
    expect("preview" in readable.properties).toBe(false);
    expect("preview" in (schema.model(vaultInput) as { properties: object }).properties).toBe(true);
  });

  test("collects referenced models transitively and sorts them by name", () => {
    const referenced = schema.referencedSchemas({
      schema: schema.returns({ refName: "schemaPost", modelType: "input" }),
    });
    // SchemaPostInput references SchemaTag, which pulls in nothing further.
    expect(Object.keys(referenced)).toEqual(["SchemaPostInput", "SchemaTag"]);
  });

  test("returns no schemas when nothing references a model", () => {
    expect(schema.referencedSchemas({ schema: schema.returns({ refName: "Int" }) })).toEqual({});
  });

  test("honours a custom ref prefix on both emit and resolve", () => {
    // `#/$defs/` contains `$`; a regex-based prefix match would read it as end-of-input and resolve nothing.
    const defs = new JsonSchemaBuilder({ refPrefix: "#/$defs/" });
    const returns = defs.returns({ refName: "schemaPost", modelType: "input" });
    expect(returns).toEqual({ $ref: "#/$defs/SchemaPostInput" });
    expect(Object.keys(defs.referencedSchemas({ schema: returns }))).toEqual(["SchemaPostInput", "SchemaTag"]);
    expect(defs.collectRefNames({ $ref: "#/components/schemas/SchemaTag" }).size).toBe(0);
  });

  test("describes an upload arg as binary regardless of the declared model", () => {
    expect(schema.upload({ type: "upload", name: "files", refName: Upload.refName, arrDepth: 1 })).toEqual({
      type: "array",
      items: { type: "string", format: "binary" },
    });
  });

  test("keeps a nullable return distinguishable from a plain one", () => {
    expect(schema.returns({ refName: "Float", nullable: true })).toEqual({
      anyOf: [{ type: "number" }, { type: "null" }],
    });
    expect(schema.returns({ refName: "Any" })).toEqual({});
  });
});

class SchemaGeo extends via((field) => ({ lat: field(Int), lng: field(Int) })) {}
ConstantRegistry.buildScalar("schemaGeo", SchemaGeo, { SchemaGeo });

class SchemaPlaceInput extends via((field) => ({
  name: field(String),
  tag: field(SchemaTag).optional(),
  tags: field([SchemaTag]),
  geo: field(SchemaGeo),
  role: field(SchemaRole).optional(),
  byLabel: field(Map, { of: SchemaTag }),
})) {}
class SchemaPlaceObject extends via(SchemaPlaceInput, () => ({})) {}
class LightSchemaPlace extends via(SchemaPlaceObject, ["name"] as const, () => ({})) {}
class SchemaPlace extends via(SchemaPlaceObject, LightSchemaPlace, () => ({})) {}
class SchemaPlaceInsight extends via(SchemaPlace, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaPlace",
  SchemaPlaceInput,
  SchemaPlaceObject,
  SchemaPlace,
  LightSchemaPlace,
  SchemaPlaceInsight,
  {},
);

describe("JsonSchemaBuilder relations", () => {
  const builder = new JsonSchemaBuilder();
  const idSchema = { type: "string", pattern: "^[0-9a-fA-F]{24}$" };
  const placeInput = SchemaPlaceInput as unknown as Parameters<typeof builder.model>[0];

  test("asks for a relation's id in a request schema and keeps an embedded scalar inline", () => {
    // `serialize` sends a relation as its id, so this is the shape the server reads; a scalar is embedded whole and
    // has no tool of its own, so it stays a `$ref`. A map's model values are also sent whole and stay inline.
    const { properties } = builder.model(placeInput, { relations: "id" }) as {
      properties: Record<string, unknown>;
    };
    expect(properties.tag).toEqual({ anyOf: [idSchema, { type: "null" }] });
    expect(properties.tags).toEqual({ type: "array", items: idSchema });
    expect(properties.geo).toEqual({ $ref: "#/components/schemas/SchemaGeo" });
    expect(properties.byLabel).toEqual({
      type: "object",
      additionalProperties: { $ref: "#/components/schemas/SchemaTag" },
    });
  });

  test("names a nested database model in a response schema instead of inlining it", () => {
    const schemas = builder.allModelSchemas({ readable: true, relations: "named" });
    const { properties } = schemas.SchemaPlace as { properties: Record<string, unknown> };
    expect(properties.tag).toEqual({ anyOf: [{ type: "object", description: "SchemaTag" }, { type: "null" }] });
    expect(properties.tags).toEqual({ type: "array", items: { type: "object", description: "SchemaTag" } });
    // The closure stops at the returned model and its scalars: nothing here refers to SchemaTag any more.
    const seed = { $ref: "#/components/schemas/SchemaPlace" };
    expect(Object.keys(builder.referencedSchemas(seed, schemas))).toEqual(["SchemaGeo", "SchemaPlace"]);
    expect(Object.keys(builder.referencedSchemas(seed, builder.allModelSchemas({ readable: true })))).toEqual([
      "SchemaGeo",
      "SchemaPlace",
      "SchemaTag",
    ]);
  });

  test("spells nullability into the type and drops the id pattern when asked", () => {
    const compact = new JsonSchemaBuilder({ nullable: "type" });
    const { properties } = compact.model(placeInput, { relations: "id", idPattern: false }) as {
      properties: Record<string, unknown>;
    };
    expect(properties.tag).toEqual({ type: ["string", "null"] });
    // An enum must list `null` too, or the type array admits what the value list still refuses.
    expect(properties.role).toEqual({ type: ["string", "null"], enum: ["admin", "user", null] });
    expect(JsonSchemaBuilder.primitive("ID", { idPattern: false })).toEqual({ type: "string" });
    // A `$ref` has no type of its own, so it keeps the `anyOf` spelling.
    expect(
      compact.arg({ type: "body", name: "tag", refName: "schemaTag", modelType: "input", nullable: true }),
    ).toEqual({
      anyOf: [{ $ref: "#/components/schemas/SchemaTagInput" }, { type: "null" }],
    });
  });
});

interface SchemaNoteDoc {
  lines: string[];
}
class SchemaNote extends PrimitiveScalar {
  static override refName = "SchemaNote";
  static override [SERVER_VALUE]: SchemaNoteDoc;
  static override [CLIENT_VALUE]: SchemaNoteDoc;
  static override jsonSchema = { type: "object", properties: { lines: { type: "array", items: { type: "string" } } } };
  static override agent: PrimitiveAgentFace<SchemaNoteDoc> = {
    schema: { type: "string", contentMediaType: "text/markdown" },
    read: (value) => value.lines.join("\n"),
  };
}
PrimitiveRegistry.register(SchemaNote);

class SchemaMemo extends PrimitiveScalar {
  static override refName = "SchemaMemo";
}
PrimitiveRegistry.register(SchemaMemo);

class SchemaPageInput extends via((field) => ({
  body: field(SchemaNote),
  drafts: field([SchemaNote]).optional(),
  byLocale: field(Map, { of: SchemaNote }),
})) {}
class SchemaPageObject extends via(SchemaPageInput, () => ({})) {}
class LightSchemaPage extends via(SchemaPageObject, [] as const, () => ({})) {}
class SchemaPage extends via(SchemaPageObject, LightSchemaPage, () => ({})) {}
class SchemaPageInsight extends via(SchemaPage, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaPage",
  SchemaPageInput,
  SchemaPageObject,
  SchemaPage,
  LightSchemaPage,
  SchemaPageInsight,
  {},
);

describe("JsonSchemaBuilder primitive faces", () => {
  const wireSchema = SchemaNote.jsonSchema;
  const agentSchema = SchemaNote.agent.schema;

  test("publishes a primitive's declared wire shape, and its agent shape only when asked for that face", () => {
    expect(JsonSchemaBuilder.primitive("SchemaNote")).toEqual(wireSchema);
    expect(JsonSchemaBuilder.primitive("SchemaNote", { face: "agent" })).toEqual(agentSchema);
  });

  test("falls back to the wire shape, then to the built-in table, when a primitive declares less", () => {
    expect(JsonSchemaBuilder.primitive("SchemaMemo", { face: "agent" })).toEqual({ type: "string" });
    expect(JsonSchemaBuilder.primitive("Date", { face: "agent" })).toEqual({ type: "string", format: "date-time" });
  });

  test("carries the face into args, returns, arrays, maps and nullability", () => {
    const agent = new JsonSchemaBuilder({ face: "agent", nullable: "type" });
    expect(agent.arg({ type: "body", name: "body", refName: "SchemaNote", nullable: true })).toEqual({
      ...agentSchema,
      type: ["string", "null"],
    });
    expect(agent.returns({ refName: "SchemaNote", arrDepth: 1 })).toEqual({ type: "array", items: agentSchema });
    const { properties } = agent.allModelSchemas().SchemaPageInput as { properties: Record<string, unknown> };
    expect(properties.body).toEqual(agentSchema);
    expect(properties.drafts).toEqual({ type: ["array", "null"], items: agentSchema });
    expect(properties.byLocale).toEqual({ type: "object", additionalProperties: agentSchema });
    const wire = new JsonSchemaBuilder().allModelSchemas().SchemaPageInput as { properties: Record<string, unknown> };
    expect(wire.properties.body).toEqual(wireSchema);
  });

  test("hands out a copy, so decorating one published schema cannot change the declaration", () => {
    const published = JsonSchemaBuilder.primitive("SchemaNote", { face: "agent" });
    published.description = "changed";
    expect(SchemaNote.agent.schema).not.toHaveProperty("description");
  });
});
