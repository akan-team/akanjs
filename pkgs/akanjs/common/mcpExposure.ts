import { capitalize } from "./capitalize";

// Shared by the server's MCP catalogue and the browser API explorer, so the two cannot disagree.
export interface McpExposureEndpoint {
  type: string;
  returns: { refName: string };
  args: { name: string; refName: string; type: string; arrDepth?: number; nullable?: boolean }[];
  guards?: string[];
  fileUpload?: boolean;
  mcp?: boolean;
  /** `false` when a guard declares `static agents = false`: no model may ever pass, whatever else the guards say. */
  agents?: boolean;
}

export interface McpExposureOption {
  refName: string;
  key: string;
  /** The read-only deployment valve: server configuration the browser explorer cannot know. */
  readOnly?: boolean;
  /** MCP Apps: judges what a rendered view may call, which lifts the two refusals that only curate a model's shelf. */
  view?: boolean;
}

/** `Any` publishes as the empty schema, which tells a model nothing, so it is left out. */
export const isMcpDescribableArg = (arg: { refName: string }) => arg.refName !== "Any";

export const mcpBaseVerbOf = (refName: string, key: string) => {
  const cap = capitalize(refName);
  if (key === refName || key === `light${cap}`) return "get" as const;
  if (key === `create${cap}`) return "create" as const;
  if (key === `update${cap}`) return "update" as const;
  if (key === `remove${cap}`) return "remove" as const;
  return null;
};

/** Hints never stand in for a guard; `openWorldHint` is false: every endpoint reaches this app's own database. */
export const mcpHintsOf = (key: string, endpoint: { type: string }) => {
  const readOnly = endpoint.type === "query";
  const destructive = !readOnly && /^(remove|delete)/.test(key);
  return {
    readOnlyHint: readOnly,
    destructiveHint: destructive,
    idempotentHint: readOnly || /^(set|update)/.test(key),
    openWorldHint: false,
  };
};

export const mcpRefusalOf = (
  endpoint: McpExposureEndpoint,
  { refName, key, readOnly, view }: McpExposureOption,
): string | null => {
  if (endpoint.mcp === false && !view)
    return "it declares `mcp: false`, so it is deliberately off the agent shelf. HTTP still serves it.";
  // Refused outright: hiding it per caller at listing time would still leave it in the document.
  if (endpoint.agents === false)
    return `its guards (${(endpoint.guards ?? []).join(", ")}) admit no agent — an act reserved for a person, so it is off the agent shelf. HTTP still serves it.`;
  if (!endpoint.guards?.length)
    return "it declares no guards, and exposure follows them — write `guards: [Public]` if anonymous access is the intent.";
  if (key === `light${capitalize(refName)}` && !view)
    return `it reads the same document as \`${refName}\` in a smaller shape — call \`${refName}\` instead.`;
  if (endpoint.type === "pubsub" || endpoint.type === "message")
    return `\`${endpoint.type}\` rides the websocket, and its internal arguments read a socket an MCP request does not have.`;
  if (readOnly && endpoint.type !== "query")
    return "this deployment is read-only, which drops every endpoint that is not a query.";
  if (endpoint.returns.refName === "Any" || endpoint.returns.refName === "Upload")
    return `a return typed \`${endpoint.returns.refName}\` cannot be described to a model.`;
  if (endpoint.returns.refName === "Binary")
    return "a return typed `Binary` is raw bytes, which cost a model its window and tell it nothing.";
  if (endpoint.fileUpload || endpoint.args.some((arg) => arg.refName === "Upload"))
    return "a file upload has no MCP representation.";
  if (endpoint.type === "mutation" && !endpoint.guards.some((name) => name !== "Public"))
    return "a mutation needs a real guard — `[Public]` is having none, spelled out.";
  const opaque = endpoint.args.find((arg) => !isMcpDescribableArg(arg) && arg.type !== "search" && !arg.nullable);
  if (opaque)
    return `its required argument \`${opaque.name}\` is typed \`Any\`, which is left out of the published schema — expose a named filter slice instead.`;
  return null;
};
