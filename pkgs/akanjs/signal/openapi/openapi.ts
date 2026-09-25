import { FetchClient } from "akanjs/fetch";
import { Msg } from "../mcp";
import { type JsonSchema, JsonSchemaBuilder } from "../schema";
import type { SerializedArg, SerializedEndpoint, SerializedSignal } from "../types";

type OpenApiParameter = Record<string, unknown>;
type OpenApiOperation = Record<string, unknown>;
type OpenApiPathItem = Record<string, OpenApiOperation>;

export interface OpenApiDocumentOptions {
  title?: string;
  version?: string;
  servers?: { url: string; description?: string }[];
  description?: string;
  resolveDescription?: (key: string) => string | undefined;
  excludeSignals?: string[];
  includeNonStandardPaths?: boolean;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: { url: string; description?: string }[];
  paths: Record<string, OpenApiPathItem>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes?: Record<string, JsonSchema>;
  };
}

/**
 * Every endpoint type this app answers over HTTP, which is what an API contract has to list.
 *
 * `prompt` is a plain `GET` mounted whether or not the app enabled MCP, so leaving it out described an app that
 * serves fewer routes than it does — and left this document disagreeing with the API explorer, which shows the
 * same route. The websocket types (`pubsub`, `message`) have no HTTP surface to describe and are absent for that
 * reason rather than by omission.
 */
const httpMethods = {
  query: "get",
  mutation: "post",
  prompt: "get",
} as const;

const schema = new JsonSchemaBuilder();
/** Not a model, so it is handed to `referencedSchemas` beside them — and travels only if a prompt route cites it. */
const promptMessageSchemaName = "PromptMessage";

export const createOpenApiDocument = (
  serializedSignal: Record<string, SerializedSignal>,
  options: OpenApiDocumentOptions = {},
): OpenApiDocument => {
  const paths: Record<string, OpenApiPathItem> = {};
  const excludeSignals = new Set(options.excludeSignals ?? ["base"]);
  let hasProtectedOperation = false;

  for (const [refName, signal] of Object.entries(serializedSignal)) {
    if (excludeSignals.has(refName)) continue;
    for (const [endpointKey, endpoint] of collectRestEndpoints(refName, signal)) {
      const declaredMethod = httpMethods[endpoint.type as keyof typeof httpMethods];
      if (!declaredMethod) continue;
      const method = endpoint.type === "mutation" ? (endpoint.method?.toLowerCase() ?? declaredMethod) : declaredMethod;

      const path = toOpenApiPath(FetchClient.makeHttpUrl(endpointKey, endpoint, signal.prefix, new Map()));
      if (!options.includeNonStandardPaths && isNonStandardOpenApiPath(path)) continue;
      const operation = createOperation(refName, endpointKey, endpoint, options);
      if (operation.security) hasProtectedOperation = true;
      paths[path] ??= {};
      paths[path][method] = operation;
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "Akan API",
      version: options.version ?? "0.0.0",
      ...(options.description ? { description: options.description } : {}),
    },
    ...(options.servers?.length ? { servers: options.servers } : {}),
    paths,
    components: {
      schemas: schema.referencedSchemas(paths, {
        ...schema.allModelSchemas(),
        [promptMessageSchemaName]: Msg.schema,
      }),
      ...(hasProtectedOperation
        ? {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          }
        : {}),
    },
  };
};

const collectRestEndpoints = (refName: string, signal: SerializedSignal): [string, SerializedEndpoint][] => {
  const baseEndpointEntries = Object.entries(FetchClient.getBaseEndpoint(refName, signal));
  const sliceEndpointEntries = signal.slice
    ? Object.entries(signal.slice).flatMap(([suffix, slice]) =>
        Object.entries(FetchClient.getEndpointFromSlice(refName, suffix, slice)),
      )
    : [];
  return [...baseEndpointEntries, ...sliceEndpointEntries, ...Object.entries(signal.endpoint)].filter(
    ([, endpoint]) => endpoint.type in httpMethods,
  );
};

const createOperation = (
  refName: string,
  endpointKey: string,
  endpoint: SerializedEndpoint,
  options: OpenApiDocumentOptions,
): OpenApiOperation => {
  const { paramArgs, searchArgs, bodyArgs, uploadArgs } = FetchClient.classifyHttpArgs(endpoint.args);
  const description = options.resolveDescription?.(`${refName}.signal.${endpointKey}.desc`);
  const guards = getProtectedGuards(endpoint.guards);
  return {
    tags: [refName],
    operationId: endpointKey,
    summary: options.resolveDescription?.(`${refName}.signal.${endpointKey}`) ?? endpointKey,
    ...(description ? { description } : {}),
    parameters: [
      ...paramArgs.map((arg) => createParameter(refName, endpointKey, arg, "path", options)),
      ...searchArgs.map((arg) => createParameter(refName, endpointKey, arg, "query", options)),
    ],
    ...(bodyArgs.length || uploadArgs.length ? { requestBody: createRequestBody(bodyArgs, uploadArgs) } : {}),
    responses: {
      "200": {
        description: "Successful response",
        content: createResponseContent(endpoint),
      },
      default: {
        description: "Error response",
      },
    },
    ...(guards.length ? { security: [{ bearerAuth: [] }], "x-akan-guards": guards } : {}),
    "x-akan-signal": refName,
    "x-akan-endpoint-type": endpoint.type,
  };
};

const createParameter = (
  refName: string,
  endpointKey: string,
  arg: SerializedArg,
  location: "path" | "query",
  options: OpenApiDocumentOptions,
): OpenApiParameter => ({
  name: arg.name,
  in: location,
  required: location === "path",
  schema: schema.arg(arg),
  ...(arg.example !== undefined ? { example: arg.example } : {}),
  ...(options.resolveDescription?.(`${refName}.signal.${endpointKey}.arg.${arg.name}.desc`)
    ? { description: options.resolveDescription(`${refName}.signal.${endpointKey}.arg.${arg.name}.desc`) }
    : {}),
});

const createRequestBody = (bodyArgs: SerializedArg[], uploadArgs: SerializedArg[]) => {
  const required = [...bodyArgs, ...uploadArgs].filter((arg) => !arg.nullable).map((arg) => arg.name);
  const bodySchema = {
    type: "object",
    properties: Object.fromEntries(
      [...bodyArgs, ...uploadArgs].map((arg) => [
        arg.name,
        uploadArgs.includes(arg) ? schema.upload(arg) : schema.arg(arg),
      ]),
    ),
    ...(required.length ? { required } : {}),
  };
  return {
    required: required.length > 0,
    content: {
      [uploadArgs.length ? "multipart/form-data" : "application/json"]: {
        schema: bodySchema,
      },
    },
  };
};

const createResponseContent = (endpoint: SerializedEndpoint) =>
  isBinaryResponseEndpoint(endpoint)
    ? {
        "application/octet-stream": {
          schema: { type: "string", format: "binary" },
        },
      }
    : {
        "application/json": {
          // Every prompt answers the same fixed shape, which its declared `Any` return cannot say. Reading the
          // return type here described the route as returning anything at all — `{}` — so a reader of this
          // document learnt that the route exists and nothing about what comes back from it.
          schema:
            endpoint.type === "prompt"
              ? { type: "array", items: { $ref: `#/components/schemas/${promptMessageSchemaName}` } }
              : schema.returns(endpoint.returns),
        },
      };

const getProtectedGuards = (guards?: string[]) =>
  (guards ?? []).filter((guard) => guard !== "None" && guard !== "Public");

const isBinaryResponseEndpoint = (endpoint: SerializedEndpoint) =>
  endpoint.returns.refName === "Upload" ||
  endpoint.returns.refName === "Binary" ||
  (endpoint.returns.refName === "Any" &&
    Boolean(endpoint.path?.includes("*") || endpoint.path?.toLowerCase().includes("blob")));

const toOpenApiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
};

const isNonStandardOpenApiPath = (path: string) => path.includes("*");
