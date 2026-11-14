import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  FLIGHT_LENGTH_PREFIXED_TAGS,
  type FlightLineRowHandler,
  flightRowsEndWatcher,
  mapFlightLineRows,
} from "./flightRowReader";
import {
  joinBytes,
  lengthPrefixedRow,
  mixedFlight,
  mixedFlightRows,
  readBytes,
  streamOfChunks,
} from "./flightRows.fixture";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("Flight row reader", () => {
  test("reads by length exactly the row tags the installed Flight client reads by length", async () => {
    const packageDir = path.dirname(Bun.resolveSync("react-server-dom-webpack/package.json", import.meta.dir));
    const client = await Bun.file(
      path.join(packageDir, "cjs/react-server-dom-webpack-client.browser.production.js"),
    ).text();
    const tagState = /rowState = \w+\[i\];([^?]*)\?\s*\(\(rowTag = rowState\), \(rowState = 2\)/g;
    const [tagCheck = ""] = Array.from(client.matchAll(tagState), ([, block]) => block);
    const tags = [...tagCheck.matchAll(/(\d+) === rowState/g)].map(([, code]) => String.fromCharCode(Number(code)));

    expect(new Set(tags)).toEqual(new Set(FLIGHT_LENGTH_PREFIXED_TAGS));
  });

  test("hands a later handler what an earlier one returned, read as a pass of its own would read it", async () => {
    const rewrites: Record<string, string | null> = {
      "5:D": null,
      "6:E": "6:null\n",
      "7:E": '7:HL["/late.css","style"]\n',
      "8:E": "8:T3,abc",
      "9:E": "no row\n",
    };
    const flight = joinBytes(
      mixedFlight,
      ...Object.keys(rewrites).map((head) => `${head}{"digest":"${head}"}\n`),
      '0:"tail"',
    );
    const rewrite: FlightLineRowHandler = (row) => {
      const head = decoder.decode(row.subarray(0, 3));
      if (head === '0:"') return encoder.encode("0:");
      const rewritten = rewrites[head];
      if (rewritten === undefined) return row;
      return rewritten === null ? null : encoder.encode(rewritten);
    };
    const read = async (chunks: Uint8Array[], stacked: boolean) => {
      const seen: string[][] = [[], []];
      const [first, second] = seen.map(
        (rows): FlightLineRowHandler =>
          (row, tag) => {
            rows.push(`${tag}|${decoder.decode(row)}`);
            return row;
          },
      );
      const source = streamOfChunks(chunks);
      const stream = stacked
        ? mapFlightLineRows(mapFlightLineRows(mapFlightLineRows(source, first), rewrite), second)
        : mapFlightLineRows(source, first, rewrite, second);
      return { output: decoder.decode(await readBytes(stream)), seen };
    };
    const splits = Array.from({ length: flight.byteLength + 1 }, (_, offset) => [
      flight.subarray(0, offset),
      flight.subarray(offset),
    ]);
    const byteByByte = Array.from({ length: flight.byteLength }, (_, index) => flight.subarray(index, index + 1));
    const differing: number[] = [];
    for (const [index, chunks] of [...splits, byteByByte].entries())
      if (!Bun.deepEquals(await read(chunks, false), await read(chunks, true))) differing.push(index);

    const { output, seen } = await read([flight], false);
    expect(differing).toEqual([]);
    expect(seen[1]).toContain("|6:null\n");
    expect(seen[1]).toContain('H|7:HL["/late.css","style"]\n');
    expect(output).toContain("8:T3,abc");
    expect(output).toContain("no row\n");
    expect(output).not.toContain('5:D{"digest"');
    expect(output.endsWith("no row\n0:")).toBe(true);
  });

  test("hands on the rows each chunk completes as one chunk, and a binary row as a chunk of its own", async () => {
    const rows = mixedFlightRows;
    const chunks = [
      joinBytes(rows.hint, rows.debug, rows.text.subarray(0, 40)),
      joinBytes(rows.text.subarray(40), rows.bytes, rows.empty, rows.redirect, rows.model),
    ];
    const reader = mapFlightLineRows(streamOfChunks(chunks)).getReader();
    const output: Buffer[] = [];
    for (let next = await reader.read(); !next.done; next = await reader.read()) output.push(Buffer.from(next.value));

    expect(output).toEqual(
      [joinBytes(rows.hint, rows.debug), rows.text, rows.bytes, joinBytes(rows.empty, rows.redirect, rows.model)].map(
        (chunk) => Buffer.from(chunk),
      ),
    );
  });

  test("hands on a row of every binary length-prefixed tag as a chunk of its own, and keeps a T row in the batch", async () => {
    const outputOf = async (tag: string) => {
      const flight = joinBytes('1:"a"\n', lengthPrefixedRow("2", tag, encoder.encode("abcdefgh")), '3:"b"\n');
      const reader = mapFlightLineRows(streamOfChunks([flight])).getReader();
      const output: string[] = [];
      for (let next = await reader.read(); !next.done; next = await reader.read())
        output.push(decoder.decode(next.value));
      return [tag, output] as const;
    };
    const tags = [...FLIGHT_LENGTH_PREFIXED_TAGS];

    expect(Object.fromEntries(await Promise.all(tags.map(outputOf)))).toEqual(
      Object.fromEntries(
        tags.map((tag) => [
          tag,
          tag === "T" ? ['1:"a"\n2:T8,abcdefgh3:"b"\n'] : ['1:"a"\n', `2:${tag}8,abcdefgh`, '3:"b"\n'],
        ]),
      ),
    );
  });

  test("hands on rows back to back in a chunk as a view of it, and copies at most 16 KB of rows that are not", async () => {
    const rows = Array.from({ length: 160 }, (_, index) => `${index.toString(16)}:"${"x".repeat(250)}"\n`);
    const chunk = joinBytes(...rows);
    const outputOf = async (...onLineRows: FlightLineRowHandler[]) => {
      const reader = mapFlightLineRows(streamOfChunks([chunk]), ...onLineRows).getReader();
      const output: Uint8Array[] = [];
      for (let next = await reader.read(); !next.done; next = await reader.read()) output.push(next.value);
      return output;
    };
    const untouched = await outputOf();
    const rewritten = await outputOf((row) => (decoder.decode(row).startsWith("0:") ? encoder.encode('0:"y"\n') : row));

    expect(untouched.map((output) => [output.buffer === chunk.buffer, output.byteLength])).toEqual([
      [true, chunk.byteLength],
    ]);
    expect(rewritten.map((output) => output.buffer === chunk.buffer)).toEqual([false, true]);
    expect(rewritten[0]?.byteLength).toBeLessThanOrEqual(16 * 1024);
    expect(Buffer.concat(rewritten)).toEqual(Buffer.from(joinBytes('0:"y"\n', ...rows.slice(1))));
  });

  test("tells an end watcher once the last row has passed the handlers, and passes every row on untouched", async () => {
    const seen: string[] = [];
    const reader = mapFlightLineRows(
      streamOfChunks([encoder.encode('0:"a"\n1:"b"')]),
      (row) => {
        seen.push(decoder.decode(row));
        return row;
      },
      flightRowsEndWatcher(() => seen.push("end")),
    ).getReader();
    const output: Uint8Array[] = [];
    for (let next = await reader.read(); !next.done; next = await reader.read()) output.push(next.value);

    expect(decoder.decode(Buffer.concat(output))).toBe('0:"a"\n1:"b"');
    expect(seen).toEqual(['0:"a"\n', '1:"b"', "end"]);
  });
});
