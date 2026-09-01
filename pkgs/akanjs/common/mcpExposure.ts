import { capitalize } from "./capitalize";

/**
 * What MCP says about one endpoint: whether it is published, why it is not, and the hints it carries.
 *
 * Structurally typed like the rest of `common/` so the same rules answer on both sides — the server builds its
 * catalogue from them and the browser API explorer badges an endpoint from them. A second implementation would
 * eventually disagree, and an audit surface that disagrees with the catalogue is worse than none.
 *
 * Every rejection returns the sentence an author reads, at boot in the server log and in the explorer. Fail-closed
 * with no reason leaves an author whose endpoint is missing from the catalogue nowhere to look but the source.
 */
export interface McpExposureEndpoint {
  type: string;
  returns: { refName: string };
  args: { name: string; refName: string; type: string; arrDepth?: number; nullable?: boolean }[];
  guards?: string[];
  fileUpload?: boolean;
}

export interface McpExposureOption {
  /**
   * The read-only deployment valve, which is server configuration. The browser explorer cannot know it and so
   * badges what the code decided; the boot log is where a read-only deployment says what it dropped.
   */
  readOnly?: boolean;
}

/** `Any` publishes as the empty schema, which tells a model nothing — so it is left out rather than described. */
export const isMcpDescribableArg = (arg: { refName: string }) => arg.refName !== "Any";

/** Which CRUD verb a generated endpoint key is, or `null` when the key is not one of the five. */
export const mcpBaseVerbOf = (refName: string, key: string) => {
  const cap = capitalize(refName);
  if (key === refName || key === `light${cap}`) return "get" as const;
  if (key === `create${cap}`) return "create" as const;
  if (key === `update${cap}`) return "update" as const;
  if (key === `remove${cap}`) return "remove" as const;
  return null;
};

/**
 * The hints a client renders beside a tool. Hints only — clients are told to distrust them, so they inform a UI
 * and never stand in for a guard. `openWorldHint` is always false: every endpoint reaches this app's own
 * database, not the wider internet.
 */
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

/** The sentence explaining why this endpoint is not in the catalogue, or `null` when it is. */
export const mcpRefusalOf = (endpoint: McpExposureEndpoint, { readOnly }: McpExposureOption = {}): string | null => {
  // The whole exposure policy, and the first gate because it applies to every kind. Publishing follows the guards:
  // an endpoint with none has had no decision made about who may reach it, and a catalogue entry is the one place
  // that omission stops being invisible. `guards: [Public]` is the same access, written down, and publishes.
  if (!endpoint.guards?.length)
    return "it declares no guards, and exposure follows them — write `guards: [Public]` if anonymous access is the intent.";
  if (endpoint.type === "prompt") return mcpPromptRefusalOf(endpoint);
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

/**
 * A prompt is a read exposed on the same terms as a query, so every rejection here is one thing: an argument
 * `prompts/get` cannot carry. Its `arguments` is a flat string map — one string per name, and no schema beside it
 * — which rules out the argument *kinds* the builder already refuses and, just as surely, two argument *types* it
 * accepts. A tool escapes both because it publishes a real JSON Schema.
 */
export const mcpPromptRefusalOf = (endpoint: McpExposureEndpoint): string | null => {
  const carried = endpoint.args.find((arg) => arg.type === "body" || arg.type === "msg" || arg.type === "room");
  if (carried)
    return `a prompt's arguments travel as a flat string map, so its \`${carried.type}\` argument \`${carried.name}\` cannot be carried.`;
  // One name carries one string, which `McpExecutionContext` then lifts into a one-element list. So a list
  // argument is published as an argument that can never hold a second value — take a delimited string and split
  // it, or expose this as a tool, whose schema can say `array`.
  const list = endpoint.args.find((arg) => arg.arrDepth);
  if (list)
    return `a prompt argument is one string, so its list argument \`${list.name}\` could never carry more than one value.`;
  // The tool path can leave an `Any` argument out of its schema and read it as omitted. A prompt has no schema to
  // leave it out of: the name is published either way, with nothing anywhere to say what belongs in it.
  const opaque = endpoint.args.find((arg) => !isMcpDescribableArg(arg));
  if (opaque)
    return `its argument \`${opaque.name}\` is typed \`Any\`, and a prompt has no schema in which to describe one.`;
  return null;
};
