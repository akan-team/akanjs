import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  type FlightBranches,
  type FlightSanitizeRecord,
  type FlightSanitizeRun,
  flightSanitizeCorpus,
  recordFlightSanitize,
  runsThatDiffer,
  wholeStreamOf,
} from "./flightSanitize.fixture";
import { createInlineRscScript, sanitizeFlightForClientStream, sanitizeFlightForSsrStream } from "./ssrFromRscRenderer";

const recordedPath = path.join(import.meta.dir, "flightSanitizeRecorded.fixture.json");
const howToRecord =
  "The Flight branches no longer match flightSanitizeRecorded.fixture.json. Read the whole-stream difference first " +
  "(ssr, client, inlineScripts, seenBySsr), then the runs named here. If the new bytes are intended, record them " +
  "with AKAN_RECORD_FLIGHT_SANITIZE=1 bun test --isolate ./server/flightSanitize.test.ts and review the fixture's diff.";

const branchesOfRender: FlightBranches = (stream, onSsrRow) => {
  const [forSsr, forClient] = stream.tee();
  return [sanitizeFlightForSsrStream(forSsr, onSsrRow), sanitizeFlightForClientStream(forClient)];
};

describe("Flight branches of a document render", () => {
  test("give the SSR decoder and the document the recorded bytes, chunk for chunk, however the stream is cut", async () => {
    const records: Record<string, FlightSanitizeRecord> = {};
    const runsOf: Record<string, FlightSanitizeRun[]> = {};
    for (const [name, input] of Object.entries(flightSanitizeCorpus)) {
      const { record, runs } = await recordFlightSanitize(branchesOfRender, input, createInlineRscScript);
      records[name] = record;
      runsOf[name] = runs;
    }
    if (process.env.AKAN_RECORD_FLIGHT_SANITIZE === "1")
      await Bun.write(recordedPath, `${JSON.stringify(records, null, 2)}\n`);
    const recorded = (await Bun.file(recordedPath).json()) as Record<string, FlightSanitizeRecord>;
    const names = Object.keys(records);
    const wholeStreams = (of: Record<string, FlightSanitizeRecord>) =>
      names.map((name) => ({ name, ...(of[name] ? wholeStreamOf(of[name]) : {}) }));
    const differingRuns = names.flatMap((name) =>
      runsThatDiffer(name, runsOf[name] ?? [], recorded[name]?.runDigests ?? ""),
    );

    expect(names, howToRecord).toEqual(Object.keys(recorded));
    expect({ wholeStreams: wholeStreams(records), differingRuns }, howToRecord).toEqual({
      wholeStreams: wholeStreams(recorded),
      differingRuns: [],
    });
  }, 60_000);
});
