import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  type FlightBranches,
  type FlightSanitizeRecord,
  flightSanitizeCorpus,
  recordFlightSanitize,
} from "./flightSanitize.fixture";
import { createInlineRscScript, sanitizeFlightForClientStream, sanitizeFlightForSsrStream } from "./ssrFromRscRenderer";

const recordedPath = path.join(import.meta.dir, "flightSanitizeRecorded.fixture.json");

const branchesOfRender: FlightBranches = (stream, onSsrRow) => {
  const [forSsr, forClient] = stream.tee();
  return [sanitizeFlightForSsrStream(forSsr, onSsrRow), sanitizeFlightForClientStream(forClient)];
};

describe("Flight branches of a document render", () => {
  test("give the SSR decoder and the document the recorded bytes, chunk for chunk, however the stream is cut", async () => {
    const records: Record<string, FlightSanitizeRecord> = {};
    for (const [name, input] of Object.entries(flightSanitizeCorpus))
      records[name] = await recordFlightSanitize(branchesOfRender, input, createInlineRscScript);
    if (process.env.AKAN_RECORD_FLIGHT_SANITIZE === "1")
      await Bun.write(recordedPath, `${JSON.stringify(records, null, 2)}\n`);
    const recorded = (await Bun.file(recordedPath).json()) as Record<string, FlightSanitizeRecord>;

    expect(Object.keys(records)).toEqual(Object.keys(recorded));
    for (const [name, record] of Object.entries(records))
      expect({ name, ...record }).toEqual({ name, ...recorded[name] });
  }, 60_000);
});
