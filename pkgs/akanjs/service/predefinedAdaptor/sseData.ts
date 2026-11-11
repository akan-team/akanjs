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

//? Security: a call that lost its arguments would otherwise run with `{}`, which every optional-argument write accepts.
export const isToolStreamCut = (calls: Iterable<{ args: string }>, ended: boolean): boolean => {
  const streamed = [...calls];
  return !!streamed.length && (!ended || streamed.some(({ args }) => parseToolArgs(args) === null));
};
