import type { AgentWireTool, AgentWireToolCall } from "./llm.adaptor";

export const eachSseData = async (body: ReadableStream<Uint8Array>, onData: (payload: string) => void) => {
  let buffer = "";
  const decoder = new TextDecoder();
  const feed = (line: string) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    try {
      onData(payload);
    } catch {
      // Throwing would lose the whole answer, text already streamed and all, over one frame the provider mangled.
    }
  };
  for await (const piece of body) {
    buffer += decoder.decode(piece, { stream: true });
    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      feed(buffer.slice(0, cut).trimEnd());
      buffer = buffer.slice(cut + 1);
      cut = buffer.indexOf("\n");
    }
  }
  feed(buffer.trimEnd());
};

//? An in-band error arrives on a 200, so its type is the only status it has; each name is one its API documents.
const inBandStatuses: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  invalid_api_key: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  model_not_found: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  rate_limit_exceeded: 429,
  insufficient_quota: 429,
  api_error: 500,
  server_error: 500,
  timeout_error: 504,
  overloaded_error: 529,
};

export const inBandStatus = (...names: unknown[]): number => {
  for (const name of names) {
    const status = typeof name === "string" && /^\d+$/.test(name) ? Number(name) : name;
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 600) return status;
    if (typeof name === "string" && Object.hasOwn(inBandStatuses, name)) return inBandStatuses[name] ?? 500;
  }
  return 500;
};

/** `null` when the arguments are not one JSON object; a tool called with none streams no fragment at all. */
export const parseToolArgs = (raw: string | undefined): Record<string, unknown> | null => {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const argsProblem = (raw: string): string => {
  try {
    JSON.parse(raw);
    return "the value is not an object";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

export const toolCallOf = (id: string, name: string, raw: string | undefined): AgentWireToolCall => {
  const args = parseToolArgs(raw);
  if (args) return { id, name, args };
  return {
    id,
    name,
    args: {},
    argsError: `Not run: the arguments were not one JSON object (${argsProblem(raw ?? "")}). Call the tool again with valid JSON arguments.`,
  };
};

const takesNoArguments = (tools: AgentWireTool[], name: string | undefined): boolean => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) return false;
  const properties = tool.parameters?.properties;
  return !properties || (typeof properties === "object" && !Object.keys(properties).length);
};

//? Security: a call that lost its arguments would otherwise run with `{}`, which every optional-argument write accepts.
//? A gateway that loses the provider mid-call still closes with its own end marker, so with no finish reason behind
//? it, empty arguments are a finished call only for a tool that takes none. Arguments that do not parse are the model's
//? own, for `toolCallOf` to hand back, only when `byModel`: behind a ceiling, a filter or a reason no API documents they
//? were cut mid-argument, and a caller that does not read `argsError` would run the call with `{}`.
export const isStreamCut = (
  calls: Iterable<{ name?: string; args: string }>,
  { ended, finished, byModel }: { ended: boolean; finished: boolean; byModel: boolean },
  tools: AgentWireTool[],
): boolean =>
  !ended ||
  [...calls].some(({ name, args }) =>
    parseToolArgs(args) === null ? !byModel : !finished && !args && !takesNoArguments(tools, name),
  );
