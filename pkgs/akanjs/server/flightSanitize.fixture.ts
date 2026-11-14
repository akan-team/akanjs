import { joinBytes, lengthPrefixedRow, mixedFlight, textRow } from "./flightRows.fixture";

const decoder = new TextDecoder();
const SHOWN_MAX_BYTES = 2048;
const MAX_SPLIT_OFFSETS = 2048;
const FIXED_CHUNK_SIZES = [3, 17, 256];
const ERRORED_CHUNK_SIZE = 16;
const MAX_ERRORED_RUNS = 6;

const batchLimitRows = [0, 1].flatMap((round) => {
  const idOf = (index: number) => (round * 256 + index + 16).toString(16);
  return [
    `${idOf(0)}:"${"m".repeat(2100)}"\n`,
    `${idOf(1)}:D{"time":${round}}\n`,
    `:HL["/batch-${round}.css","stylesheet"]\n`,
    ...Array.from({ length: 6 }, (_, index) => `${idOf(index + 2)}:"${"m".repeat(2100)}"\n`),
    ...Array.from({ length: 60 }, (_, index) => `${idOf(index + 8)}:"${"s".repeat(40)}"\n`),
  ];
});

export const flightSanitizeCorpus: Record<string, Uint8Array> = {
  "an empty stream": new Uint8Array(0),
  "model rows": joinBytes('1:"a"\n', '2:["$","div",null,{"children":"$1"}]\n', '0:"$2"\n'),
  "blank lines and rows of other tags": joinBytes(
    "\n\n",
    "no colon here\n",
    "0:\n",
    ":\n",
    "7:null\n",
    '1:I["/_akan/client/a.js",["a","/_akan/client/a.js"],"default"]\n',
    '8:"/_akan/client/b.js"\n',
    "f:#x\n",
    '3:W["log","x"]\n',
    '4:N{"name":"x"}\n',
  ),
  "debug rows": joinBytes(
    'a:D{"time":1}\n',
    '0:"x"\n',
    'b:D{"name":"Page","env":"Server"}\n',
    'c:D{"time":2}\n',
    '1:"y"\n',
    'd:D{"time":3}\n',
  ),
  "only debug rows": joinBytes('a:D{"time":1}\n', 'b:D{"time":2}\n'),
  "stylesheet hints": joinBytes(
    ':HL["/style.css","stylesheet"]\n',
    '0:"x"\n',
    ':HL["/quote\\".css","stylesheet"]\n',
    ':HL["/font.woff2","font"]\n',
    ':HL["/options.css","stylesheet",{"crossOrigin":""}]\n',
    ':HD"https://cdn.example"\n',
    '5:HL["/with-id.css","stylesheet"]\n',
    ':HL["/two.css","stylesheet"]:HL["/three.css","stylesheet"]\n',
    '6:"a model row naming :HL[\\"/model.css\\",\\"stylesheet\\"]"\n',
  ),
  "redirect error rows": joinBytes(
    'c7:E{"digest":"AKAN_REDIRECT","name":"AkanRedirectError","message":"Redirect to /target"}\n',
    'c8:E{"digest":"AKAN_REDIRECT;push;308;%2Flogin%3Fnext%3D%252Fdashboard","name":"Error"}\n',
    'nf:E{"digest":"AKAN_NOT_FOUND","name":"AkanNotFoundError","message":"Not Found"}\n',
    'er:E{"digest":"AKAN_REDIRECTED","name":"Error","message":"Boom"}\n',
    'C9:E{"digest":"AKAN_REDIRECT"}\n',
    ':E{"digest":"AKAN_REDIRECT"}\n',
    '0:"after"\n',
  ),
  "rows holding script-closing text": joinBytes(
    '1:"</script><script>alert(1)</script>"\n',
    '2:"<!-- <script> --> &   "\n',
    textRow("3", `${"x".repeat(1024)}</script><!--\n4:D{"time":1}\n`),
    'a:D{"text":"</script><!--"}\n',
    ':HL["/</script>.css","stylesheet"]\n',
    'c7:E{"digest":"AKAN_REDIRECT;replace;307;%2F","message":"</script><!--"}\n',
    '0:["$1","$2","$3"]\n',
  ),
  "multi-byte characters": joinBytes(
    '1:"한글 😀 ñ"\n',
    'a:D{"text":"한글 😀"}\n',
    ':HL["/스타일.css","stylesheet"]\n',
    'c7:E{"digest":"AKAN_REDIRECT;replace;307;%2F","message":"리다이렉트 😀"}\n',
    textRow("2", `${"가".repeat(400)}\n3:D{}\n${"😀".repeat(10)}`),
    '0:"$2"\n',
  ),
  "rows that are not UTF-8": joinBytes(
    new Uint8Array([0xff, 0x00, 0x0a]),
    '1:E{"digest":"AKAN_REDIRECT"',
    new Uint8Array([0xff]),
    "}\n",
    ':HL["/a',
    new Uint8Array([0xc3]),
    '.css","stylesheet"]\n',
    "a:D",
    new Uint8Array([0xfe]),
    "\n",
    lengthPrefixedRow("2", "o", new Uint8Array([0x0a, 0xff, 0x0a])),
    '0:"x"\n',
  ),
  "length-prefixed rows": mixedFlight,
  "an unterminated model row": joinBytes('0:"x"\n', '1:"cut'),
  "an unterminated debug row": joinBytes('0:"x"\n', 'a:D{"time":1}'),
  "an unterminated stylesheet hint": joinBytes('0:"x"\n', ':HL["/style.css","stylesheet"]'),
  "an unterminated redirect row": joinBytes('0:"x"\n', 'c7:E{"digest":"AKAN_REDIRECT"}'),
  "an unterminated text row": joinBytes('0:"x"\n', textRow("1", "abc\ndef").subarray(0, 8)),
  "an unterminated row length": joinBytes('0:"x"\n', "1:T1f"),
  "a stream ending at a row tag": joinBytes('0:"x"\n', "1:"),
  "copied batches past the batch limit": joinBytes(...batchLimitRows, '0:"end"\n'),
};

export type FlightBranches = (
  stream: ReadableStream<Uint8Array>,
  onSsrRow: (row: Uint8Array, tag: string) => void,
) => readonly [ssr: ReadableStream<Uint8Array>, client: ReadableStream<Uint8Array>];

interface BranchOutput {
  chunks: Uint8Array[];
  end: string;
}

interface BranchRun {
  ssr: BranchOutput;
  client: BranchOutput;
  seen: Array<readonly [tag: string, row: Uint8Array]>;
}

type Shown = string | { base64: string } | { byteLength: number; sha256: string };

export interface FlightSanitizeRecord {
  ssr: Shown[];
  client: Shown[];
  inlineScripts: Shown[];
  seenBySsr: Array<[tag: string, row: Shown]>;
  runs: number;
  sha256OfRuns: string;
}

const sha256 = (bytes: Uint8Array): string => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const shown = (bytes: Uint8Array): Shown => {
  if (bytes.byteLength > SHOWN_MAX_BYTES) return { byteLength: bytes.byteLength, sha256: sha256(bytes) };
  const text = decoder.decode(bytes);
  return Buffer.from(text).equals(Buffer.from(bytes)) ? text : { base64: Buffer.from(bytes).toString("base64") };
};

const sourceOf = (chunks: Uint8Array[], errorAfter: number | null): ReadableStream<Uint8Array> => {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index === errorAfter) {
        //? An erroring stream drops what its tee branches have not read yet; a macrotask later they have read it all.
        await new Promise((resolve) => setTimeout(resolve, 1));
        controller.error(new Error("the flight source failed"));
      } else if (index === chunks.length) controller.close();
      else controller.enqueue(chunks[index++]);
    },
  });
};

const readBranch = async (stream: ReadableStream<Uint8Array>): Promise<BranchOutput> => {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return { chunks, end: "closed" };
      chunks.push(value.slice());
    }
  } catch (error) {
    return { chunks, end: `errored: ${error instanceof Error ? error.message : String(error)}` };
  }
};

const runBranches = async (
  branches: FlightBranches,
  chunks: Uint8Array[],
  errorAfter: number | null,
): Promise<BranchRun> => {
  const seen: BranchRun["seen"] = [];
  const [ssrStream, clientStream] = branches(sourceOf(chunks, errorAfter), (row, tag) => seen.push([tag, row.slice()]));
  const [ssr, client] = await Promise.all([readBranch(ssrStream), readBranch(clientStream)]);
  return { ssr, client, seen };
};

const fixedChunks = (input: Uint8Array, size: number): Uint8Array[] =>
  Array.from({ length: Math.ceil(input.byteLength / size) }, (_, index) =>
    input.subarray(index * size, (index + 1) * size),
  );

const chunkingsOf = (input: Uint8Array): Array<{ label: string; chunks: Uint8Array[]; errorAfter: number | null }> => {
  const stride = Math.ceil((input.byteLength + 1) / MAX_SPLIT_OFFSETS);
  const splits = Array.from({ length: Math.floor(input.byteLength / stride) + 1 }, (_, index) => index * stride);
  const errored = fixedChunks(input, ERRORED_CHUNK_SIZE);
  const erroredStride = Math.ceil((errored.length + 1) / MAX_ERRORED_RUNS);
  const errorPoints = Array.from(
    { length: Math.floor(errored.length / erroredStride) + 1 },
    (_, index) => index * erroredStride,
  );
  return [
    ...splits.map((offset) => ({
      label: `split at ${offset}`,
      chunks: [input.subarray(0, offset), input.subarray(offset)],
      errorAfter: null,
    })),
    ...[1, ...FIXED_CHUNK_SIZES].map((size) => ({
      label: `chunks of ${size}`,
      chunks: fixedChunks(input, size),
      errorAfter: null,
    })),
    ...errorPoints.map((errorAfter) => ({ label: `failing after ${errorAfter} chunks`, chunks: errored, errorAfter })),
  ];
};

export const recordFlightSanitize = async (
  branches: FlightBranches,
  input: Uint8Array,
  inlineScriptOf: (chunk: Uint8Array) => string,
): Promise<FlightSanitizeRecord> => {
  const whole = await runBranches(branches, input.byteLength > 0 ? [input] : [], null);
  const chunkings = chunkingsOf(input);
  const hasher = new Bun.CryptoHasher("sha256");
  for (const { label, chunks, errorAfter } of chunkings) {
    const run = await runBranches(branches, chunks, errorAfter);
    const outputs = [run.ssr, run.client].map(
      (output) => `${output.end} [${output.chunks.map((chunk) => chunk.byteLength).join(",")}]`,
    );
    const seen = run.seen.map(([tag, row]) => `${tag}${row.byteLength}`).join(",");
    hasher.update(`\n${label}: ssr ${outputs[0]} client ${outputs[1]} seen [${seen}]\n`);
    for (const chunk of [...run.ssr.chunks, ...run.client.chunks, ...run.seen.map(([, row]) => row)])
      hasher.update(chunk);
  }
  return {
    ssr: whole.ssr.chunks.map(shown),
    client: whole.client.chunks.map(shown),
    inlineScripts: whole.client.chunks.map((chunk) => shown(Buffer.from(inlineScriptOf(chunk)))),
    seenBySsr: whole.seen.map(([tag, row]) => [tag, shown(row)]),
    runs: chunkings.length,
    sha256OfRuns: hasher.digest("hex"),
  };
};
