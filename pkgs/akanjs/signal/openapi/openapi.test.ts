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
import type { SerializedSignal } from "../types";
import { createOpenApiDocument } from "./openapi";

class OpenApiRole extends enumOf("openApiRole", ["admin", "user"] as const) {}

class OpenApiItemInput extends via((field) => ({
  title: field(String, { minlength: 2, example: "Hello" }),
  role: field(OpenApiRole, { example: "admin" }),
})) {}

class OpenApiItemObject extends via(OpenApiItemInput, (field) => ({
  viewCount: field(Int, { example: 3 }),
})) {}

class LightOpenApiItem extends via(OpenApiItemObject, ["title", "role"] as const, () => ({})) {}

class OpenApiItem extends via(OpenApiItemObject, LightOpenApiItem, () => ({})) {}

class OpenApiItemInsight extends via(OpenApiItem, (field) => ({
  count: field(Int),
})) {}

ConstantRegistry.buildModel(
  "openApiItem",
  OpenApiItemInput,
  OpenApiItemObject,
  OpenApiItem,
  LightOpenApiItem,
  OpenApiItemInsight,
  { OpenApiRole },
);

const serializedSignal: Record<string, SerializedSignal> = {
  base: {
    endpoint: {
      ping: {
        type: "query",
        args: [],
        returns: { refName: "String" },
      },
    },
  },
  openApiItem: {
    prefix: "openApiItem",
    getGuards: ["Public"],
    cruGuards: ["User"],
    slice: {
      active: {
        args: [{ type: "search", name: "role", refName: "String", enum: "openApiRole" }],
        guards: ["User"],
      },
    },
    endpoint: {
      searchOpenApiItems: {
        type: "query",
        args: [{ type: "search", name: "q", refName: "String", nullable: true }],
        returns: { refName: "openApiItem", modelType: "light", arrDepth: 1 },
      },
      uploadOpenApiItemFiles: {
        type: "mutation",
        args: [{ type: "upload", name: "files", refName: Upload.refName, arrDepth: 1 }],
        returns: { refName: "Boolean" },
        guards: ["User"],
        fileUpload: true,
      },
      openApiItemMessage: {
        type: "message",
        args: [{ type: "msg", name: "data", refName: "String" }],
        returns: { refName: "String" },
      },
      getBlob: {
        type: "query",
        path: "localFile/getBlob/*",
        args: [],
        returns: { refName: "Any" },
      },
    },
  },
};

describe("createOpenApiDocument", () => {
  test("converts serialized signals to OpenAPI paths and schemas", () => {
    const document = createOpenApiDocument(serializedSignal, {
      title: "Test API",
      version: "1.0.0",
      servers: [{ url: "https://example.test" }],
    });

    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toEqual({ title: "Test API", version: "1.0.0" });
    expect(document.servers).toEqual([{ url: "https://example.test" }]);
    expect(document.paths["/openApiItem/searchOpenApiItems"]?.get?.parameters).toEqual([
      {
        name: "q",
        in: "query",
        required: false,
        schema: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
    ]);
    expect(document.paths["/openApiItem/createOpenApiItem"]?.post?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["data"],
            properties: {
              data: { $ref: "#/components/schemas/OpenApiItemInput" },
            },
          },
        },
      },
    });
    expect(document.paths["/openApiItem/openApiItem/{openApiItemId}"]?.get?.parameters).toMatchObject([
      {
        name: "openApiItemId",
        in: "path",
        required: true,
      },
    ]);
    expect(document.paths["/openApiItem/openApiItemListActive"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(document.paths["/openApiItem/uploadOpenApiItemFiles"]?.post?.requestBody).toMatchObject({
      content: {
        "multipart/form-data": {
          schema: {
            properties: {
              files: { type: "array", items: { type: "string", format: "binary" } },
            },
          },
        },
      },
    });
    // The websocket types have no HTTP surface to describe, which is why they are absent.
    expect(document.paths["/openApiItem/openApiItemMessage"]).toBeUndefined();
    expect(document.paths["/ping"]).toBeUndefined();
    expect(document.paths["/localFile/getBlob/*"]).toBeUndefined();
    expect(document.components.securitySchemes?.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
    expect(document.components.schemas.OpenApiItemInput).toMatchObject({
      type: "object",
      required: ["title", "role"],
      properties: {
        title: { type: "string" },
        role: { type: "string", enum: ["admin", "user"] },
      },
    });
    expect(document.components.schemas.AccessToken).toBeUndefined();
  });

  test("documents a mutation under the verb it declares", () => {
    const document = createOpenApiDocument({
      openApiItem: {
        prefix: "openApiItem",
        endpoint: {
          patchOpenApiItem: {
            type: "mutation",
            method: "PATCH",
            args: [{ type: "body", name: "data", refName: "openApiItem", modelType: "input" }],
            returns: { refName: "Boolean" },
            guards: ["User"],
          },
        },
      },
    });

    expect(Object.keys(document.paths["/openApiItem/patchOpenApiItem"])).toEqual(["patch"]);
  });

  test("can include base and non-standard paths explicitly", () => {
    const document = createOpenApiDocument(serializedSignal, {
      excludeSignals: [],
      includeNonStandardPaths: true,
    });

    expect(document.paths["/ping"]?.get?.operationId).toBe("ping");
    expect(document.paths["/localFile/getBlob/*"]?.get?.operationId).toBe("getBlob");
    expect(document.paths["/localFile/getBlob/*"]?.get?.responses).toMatchObject({
      "200": {
        content: {
          "application/octet-stream": {
            schema: { type: "string", format: "binary" },
          },
        },
      },
    });
  });
});

interface OpenApiNoteDoc {
  lines: string[];
}
class OpenApiNote extends PrimitiveScalar {
  static override refName = "OpenApiNote";
  static override [SERVER_VALUE]: OpenApiNoteDoc;
  static override [CLIENT_VALUE]: OpenApiNoteDoc;
  static override jsonSchema = { type: "object", properties: { lines: { type: "array" } } };
  static override agent: PrimitiveAgentFace<OpenApiNoteDoc> = {
    schema: { type: "string" },
    read: (value) => value.lines.join("\n"),
  };
}
PrimitiveRegistry.register(OpenApiNote);

class OpenApiPageInput extends via((field) => ({ body: field(OpenApiNote) })) {}
class OpenApiPageObject extends via(OpenApiPageInput, () => ({})) {}
class LightOpenApiPage extends via(OpenApiPageObject, [] as const, () => ({})) {}
class OpenApiPage extends via(OpenApiPageObject, LightOpenApiPage, () => ({})) {}
class OpenApiPageInsight extends via(OpenApiPage, () => ({})) {}
ConstantRegistry.buildModel(
  "openApiPage",
  OpenApiPageInput,
  OpenApiPageObject,
  OpenApiPage,
  LightOpenApiPage,
  OpenApiPageInsight,
  {},
);

describe("createOpenApiDocument with an agent-faced primitive", () => {
  test("describes the wire shape a browser sends, never the agent face", () => {
    const document = createOpenApiDocument({
      openApiPage: {
        prefix: "openApiPage",
        endpoint: {
          rewriteOpenApiPage: {
            type: "mutation",
            args: [
              { type: "body", name: "body", refName: "OpenApiNote" },
              { type: "body", name: "data", refName: "openApiPage", modelType: "input" },
            ],
            returns: { refName: "openApiPage", modelType: "full" },
            guards: ["User"],
          },
        },
      },
    });
    expect(document.paths["/openApiPage/rewriteOpenApiPage"]?.post?.requestBody).toMatchObject({
      content: { "application/json": { schema: { properties: { body: OpenApiNote.jsonSchema } } } },
    });
    expect(document.components.schemas.OpenApiPageInput).toMatchObject({
      properties: { body: OpenApiNote.jsonSchema },
    });
  });
});
