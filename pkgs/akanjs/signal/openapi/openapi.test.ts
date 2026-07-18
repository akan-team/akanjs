import { describe, expect, test } from "bun:test";
import { enumOf, Int, Upload } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { SerializedSignal } from "../types";
import { createOpenApiDocument } from "./openapi";

const OpenApiRole = enumOf("openApiRole", ["admin", "user"] as const);

class OpenApiItemInput extends via((field) => ({
  title: field(String, { minlength: 2, example: "Hello" }),
  role: field(String, { enum: OpenApiRole, example: "admin" }),
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
