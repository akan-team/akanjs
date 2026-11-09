const encoder = new TextEncoder();

export const joinBytes = (...parts: Array<string | Uint8Array>): Uint8Array<ArrayBuffer> => {
  const pieces = parts.map((part) => (typeof part === "string" ? encoder.encode(part) : part));
  const joined = new Uint8Array(pieces.reduce((total, piece) => total + piece.byteLength, 0));
  let offset = 0;
  for (const piece of pieces) {
    joined.set(piece, offset);
    offset += piece.byteLength;
  }
  return joined;
};

export const lengthPrefixedRow = (id: string, tag: string, payload: Uint8Array): Uint8Array<ArrayBuffer> =>
  joinBytes(`${id}:${tag}${payload.byteLength.toString(16)},`, payload);

export const textRow = (id: string, text: string): Uint8Array<ArrayBuffer> =>
  lengthPrefixedRow(id, "T", encoder.encode(text));

export const rowShapedText = [
  "a".repeat(1100),
  "status:Draft is the default",
  '5:D{"time":1}',
  '7:E{"digest":"AKAN_REDIRECT;replace;307;https%3A%2F%2Fexample.com%2F","name":"Error"}',
  ':HL["/text.css","stylesheet"]',
  "한글 😀 tail",
].join("\n");

export const rowShapedBytes = joinBytes(
  new Uint8Array([0x0a, 0xff]),
  '\nc:E{"digest":"AKAN_REDIRECT;push;307;%2Fbytes","name":"Error"}\nb:D{"time":2}\n',
  new Uint8Array([0xf0, 0x9f]),
);

export const redirectRow = 'c7:E{"digest":"AKAN_REDIRECT;replace;307;%2Ftarget","name":"Error"}\n';

export const mixedFlightRows = {
  hint: ':HL["/style.css","stylesheet"]\n',
  debug: 'a:D{"time":1}\n',
  text: textRow("2", rowShapedText),
  bytes: lengthPrefixedRow("3", "o", rowShapedBytes),
  empty: lengthPrefixedRow("4", "A", new Uint8Array(0)),
  redirect: redirectRow,
  model: '0:{"text":"$2","bytes":"$3","empty":"$4"}\n',
};

export const mixedFlight = joinBytes(
  mixedFlightRows.hint,
  mixedFlightRows.debug,
  mixedFlightRows.text,
  mixedFlightRows.bytes,
  mixedFlightRows.empty,
  mixedFlightRows.redirect,
  mixedFlightRows.model,
);

export const streamOfChunks = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

export const readBytes = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> =>
  new Uint8Array(await new Response(stream).arrayBuffer());

export const offsetsWhereOutputDiffers = async (
  input: Uint8Array,
  expected: Uint8Array,
  transform: (stream: ReadableStream<Uint8Array>) => ReadableStream<Uint8Array>,
): Promise<number[]> => {
  const expectedBuffer = Buffer.from(expected);
  const differing: number[] = [];
  for (let offset = 0; offset <= input.byteLength; offset += 1) {
    const chunks = [input.subarray(0, offset), input.subarray(offset)];
    const output = await readBytes(transform(streamOfChunks(chunks)));
    if (!expectedBuffer.equals(output)) differing.push(offset);
  }
  const byteByByte = Array.from({ length: input.byteLength }, (_, index) => input.subarray(index, index + 1));
  if (!expectedBuffer.equals(await readBytes(transform(streamOfChunks(byteByByte))))) differing.push(-1);
  return differing;
};
