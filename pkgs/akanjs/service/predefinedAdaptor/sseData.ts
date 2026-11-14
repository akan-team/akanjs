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
//? it, empty arguments are a finished call only for a tool that takes none. Behind a finish reason, arguments that do
//? not parse are the model's, and `toolCallOf` hands them back to it.
export const isStreamCut = (
  calls: Iterable<{ name?: string; args: string }>,
  { ended, finished }: { ended: boolean; finished: boolean },
  tools: AgentWireTool[],
): boolean =>
  !ended ||
  (!finished &&
    [...calls].some(({ name, args }) => parseToolArgs(args) === null || (!args && !takesNoArguments(tools, name))));
