import { type Cls, FIELD_META, getNonArrayModel, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { type ConstantCls, type ConstantField, ConstantRegistry, type ConstantType } from "akanjs/constant";
import { FetchClient } from "akanjs/fetch";
import type { SerializedArg, SerializedEndpoint, SerializedReturns, SerializedSignal } from "../types";

type OpenApiSchema = Record<string, unknown>;
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
    schemas: Record<string, OpenApiSchema>;
    securitySchemes?: Record<string, OpenApiSchema>;
  };
}

const httpMethods = {
  query: "get",
  mutation: "post",
} as const;

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
      const method = httpMethods[endpoint.type as keyof typeof httpMethods];
      if (!method) continue;

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
      schemas: createReferencedComponentSchemas(paths),
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
    ([, endpoint]) => endpoint.type === "query" || endpoint.type === "mutation",
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
  schema: createArgSchema(arg),
  ...(arg.example !== undefined ? { example: arg.example } : {}),
  ...(options.resolveDescription?.(`${refName}.signal.${endpointKey}.arg.${arg.name}.desc`)
    ? { description: options.resolveDescription(`${refName}.signal.${endpointKey}.arg.${arg.name}.desc`) }
    : {}),
});

const createRequestBody = (bodyArgs: SerializedArg[], uploadArgs: SerializedArg[]) => {
  const required = [...bodyArgs, ...uploadArgs].filter((arg) => !arg.nullable).map((arg) => arg.name);
  const schema = {
    type: "object",
    properties: Object.fromEntries(
      [...bodyArgs, ...uploadArgs].map((arg) => [
        arg.name,
        uploadArgs.includes(arg) ? createUploadSchema(arg) : createArgSchema(arg),
      ]),
    ),
    ...(required.length ? { required } : {}),
  };
  return {
    required: required.length > 0,
    content: {
      [uploadArgs.length ? "multipart/form-data" : "application/json"]: {
        schema,
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
          schema: createReturnSchema(endpoint.returns),
        },
      };

const createReturnSchema = (returns: SerializedReturns): OpenApiSchema =>
  withNullable(
    withArrayDepth(createRefSchema(returns.refName, returns.modelType), returns.arrDepth ?? 0),
    !!returns.nullable,
  );

const createArgSchema = (arg: SerializedArg): OpenApiSchema => {
  const schema = arg.enum ? createEnumSchema(arg.enum) : createRefSchema(arg.refName, arg.modelType);
  return withNullable(withArrayDepth(schema, arg.arrDepth ?? 0), !!arg.nullable);
};

const createUploadSchema = (arg: SerializedArg): OpenApiSchema => {
  const fileSchema = { type: "string", format: "binary" };
  return withNullable(withArrayDepth(fileSchema, arg.arrDepth ?? 0), !!arg.nullable);
};

const createRefSchema = (refName: string, modelType?: ConstantType): OpenApiSchema => {
  if (!modelType) return createPrimitiveSchema(refName);
  const modelRef = ConstantRegistry.getModelRef(refName, modelType);
  return { $ref: `#/components/schemas/${ConstantRegistry.getModelName(modelRef as Cls)}` };
};

const createComponentSchemas = (): Record<string, OpenApiSchema> => {
  const schemas: Record<string, OpenApiSchema> = {};
  for (const [, database] of ConstantRegistry.database.entries()) {
    [database.input, database.object, database.full, database.light, database.insight].forEach((modelRef) => {
      schemas[ConstantRegistry.getModelName(modelRef)] = createModelSchema(modelRef);
    });
  }
  for (const [, scalar] of ConstantRegistry.scalar.entries()) {
    schemas[ConstantRegistry.getModelName(scalar.model)] = createModelSchema(scalar.model);
  }
  return schemas;
};

const createReferencedComponentSchemas = (paths: Record<string, OpenApiPathItem>): Record<string, OpenApiSchema> => {
  const allSchemas = createComponentSchemas();
  const referencedNames = collectSchemaRefNames(paths);
  const pending = [...referencedNames];
  for (let idx = 0; idx < pending.length; idx++) {
    const schemaName = pending[idx];
    if (!schemaName) continue;
    const schema = allSchemas[schemaName];
    if (!schema) continue;
    for (const nestedName of collectSchemaRefNames(schema)) {
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
};

const collectSchemaRefNames = (value: unknown): Set<string> => {
  const refs = new Set<string>();
  const visit = (current: unknown) => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    const record = current as Record<string, unknown>;
    if (typeof record.$ref === "string") {
      const match = record.$ref.match(/^#\/components\/schemas\/(.+)$/);
      if (match?.[1]) refs.add(match[1]);
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return refs;
};

const createModelSchema = (modelRef: ConstantCls): OpenApiSchema => {
  const fields = (modelRef as { [FIELD_META]?: Record<string, ConstantField> })[FIELD_META] ?? {};
  const properties: Record<string, OpenApiSchema> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    const props = field.getProps();
    properties[key] = createFieldSchema(field);
    if (!props.nullable) required.push(key);
  }
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
};

const createFieldSchema = (field: ConstantField): OpenApiSchema => {
  const props = field.getProps();
  const schema = props.enum ? createInlineEnumSchema([...props.enum.values]) : createFieldRefSchema(props);
  return withNullable(withArrayDepth(schema, props.arrDepth), props.nullable);
};

const createFieldRefSchema = (props: ReturnType<ConstantField["getProps"]>): OpenApiSchema => {
  if (props.isMap) {
    const [valueRef, valueArrDepth] = getNonArrayModel(props.of as Cls | Cls[]);
    return {
      type: "object",
      additionalProperties: withArrayDepth(createModelRefSchema(valueRef as Cls), valueArrDepth),
    };
  }
  return createModelRefSchema(props.modelRef as Cls);
};

const createModelRefSchema = (modelRef: Cls): OpenApiSchema => {
  if (PrimitiveRegistry.has(modelRef))
    return createPrimitiveSchema(PrimitiveRegistry.getName(modelRef as typeof PrimitiveScalar));
  return { $ref: `#/components/schemas/${ConstantRegistry.getModelName(modelRef)}` };
};

const createPrimitiveSchema = (refName: string): OpenApiSchema => {
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
    case "Any":
      return {};
    case "String":
    default:
      return { type: "string" };
  }
};

const createEnumSchema = (refName: string): OpenApiSchema => {
  const enumRef = ConstantRegistry.enum.get(refName);
  if (!enumRef) return { type: "string", "x-akan-enum": refName };
  return createInlineEnumSchema([...enumRef.values]);
};

const createInlineEnumSchema = (values: unknown[]): OpenApiSchema => ({
  type: values.every((value) => typeof value === "number") ? "number" : "string",
  enum: values,
});

const withArrayDepth = (schema: OpenApiSchema, arrDepth: number): OpenApiSchema => {
  let current = schema;
  for (let idx = 0; idx < arrDepth; idx++) current = { type: "array", items: current };
  return current;
};

const withNullable = (schema: OpenApiSchema, nullable: boolean): OpenApiSchema =>
  nullable ? { anyOf: [schema, { type: "null" }] } : schema;

const getProtectedGuards = (guards?: string[]) =>
  (guards ?? []).filter((guard) => guard !== "None" && guard !== "Public");

const isBinaryResponseEndpoint = (endpoint: SerializedEndpoint) =>
  endpoint.returns.refName === "Upload" ||
  (endpoint.returns.refName === "Any" &&
    Boolean(endpoint.path?.includes("*") || endpoint.path?.toLowerCase().includes("blob")));

const toOpenApiPath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
};

const isNonStandardOpenApiPath = (path: string) => path.includes("*");
