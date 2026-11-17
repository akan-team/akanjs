import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { RouteRuntimePays } from "./routeRuntimePays";

const makeTempRoot = tempDirs("akan-devkit-route-pays-");

interface Measured {
  routes: Record<string, string[]>;
  whole: Record<string, number>;
  measured: Record<string, number>;
  kept?: string[];
  refused?: string[];
}

const decide = ({ routes, whole, measured, kept = [], refused = [] }: Measured) =>
  RouteRuntimePays.decide({
    entriesByRoute: new Map(Object.entries(routes)),
    isKept: (entry) => kept.includes(entry),
    isRefused: (entry) => refused.includes(entry),
    whole: new Map(Object.entries(whole)),
    measured: new Map(Object.entries(measured)),
  });

describe("which entries keep the whole runtime because per module made a page no smaller", () => {
  test("a route smaller per module keeps loading per module", () => {
    expect(decide({ routes: { "/memo": ["Memo"] }, whole: { "/memo": 900 }, measured: { "/memo": 400 } })).toEqual([]);
  });

  test("a route no smaller per module keeps the whole runtime in the entries only such routes hold", () => {
    const verdicts = decide({
      routes: { "/board": ["Board", "Frame"], "/memo": ["Memo"] },
      whole: { "/board": 900, "/memo": 900 },
      measured: { "/board": 900, "/memo": 400 },
    });
    expect(verdicts).toEqual([
      { entry: "Board", route: "/board", whole: 900, perModule: 900 },
      { entry: "Frame", route: "/board", whole: 900, perModule: 900 },
    ]);
  });

  test("an entry shared with a route that got smaller stays narrowed while that route gained more than the others lose", () => {
    const routes = { "/board": ["Frame"], "/memo": ["Frame", "Memo"] };
    const whole = { "/board": 900, "/memo": 900 };
    expect(decide({ routes, whole, measured: { "/board": 950, "/memo": 400 } })).toEqual([]);
    expect(decide({ routes, whole, measured: { "/board": 1_500, "/memo": 850 } })).toEqual([
      { entry: "Frame", route: "/board", whole: 900, perModule: 1_500 },
    ]);
  });

  test("a route an entry already keeps whole is not judged, so judging the same sizes again after keeping changes nothing", () => {
    const measured = {
      routes: { "/board": ["Board", "Frame"], "/memo": ["Frame", "Memo"] },
      whole: { "/board": 900, "/memo": 900 },
      measured: { "/board": 950, "/memo": 400 },
    };
    const first = decide(measured);
    expect(first.map(({ entry }) => entry)).toEqual(["Board"]);
    expect(decide({ ...measured, kept: first.map(({ entry }) => entry) })).toEqual([]);
  });

  test("an entry a build tried keeping, where a page came out larger, is not named again", () => {
    const measured = {
      routes: { "/board": ["Board", "Frame"], "/memo": ["Memo"] },
      whole: { "/board": 900, "/memo": 900 },
      measured: { "/board": 950, "/memo": 950 },
    };
    expect(decide(measured).map(({ entry }) => entry)).toEqual(["Board", "Frame", "Memo"]);
    expect(decide({ ...measured, refused: ["Board", "Frame"] }).map(({ entry }) => entry)).toEqual(["Memo"]);
  });

  describe("the build that kept the named entries, against the one before it", () => {
    const routes = { "/board": ["Board"], "/memo": ["Memo"], "/plain": ["Plain"] };
    const larger = (after: Record<string, number>, was: string[] = []) =>
      RouteRuntimePays.larger({
        entriesByRoute: new Map(Object.entries(routes)),
        wasKept: (entry) => was.includes(entry),
        isKept: (entry) => ["Board", "Memo"].includes(entry),
        before: new Map(Object.entries({ "/board": 950, "/memo": 950, "/plain": 400 })),
        after: new Map(Object.entries(after)),
      });

    test("stands where every route it moved to the whole runtime came out smaller", () => {
      expect(larger({ "/board": 900, "/memo": 949, "/plain": 400 })).toEqual([]);
    });

    test("names the routes it moved that came out no smaller", () => {
      expect(larger({ "/board": 900, "/memo": 950, "/plain": 400 })).toEqual(["/memo"]);
      expect(larger({ "/board": 1_200, "/memo": 990, "/plain": 300 })).toEqual(["/board", "/memo"]);
    });

    test("names every route it moved where they shrank and the routes together did not", () => {
      expect(larger({ "/board": 940, "/memo": 940, "/plain": 420 })).toEqual(["/board", "/memo"]);
    });

    test("judges no route that kept the whole runtime before it", () => {
      expect(larger({ "/board": 900, "/memo": 960, "/plain": 400 }, ["Memo"])).toEqual([]);
    });
  });

  test("a route is sized by the chunks its entries import statically, a chunk two entries share counted once", async () => {
    const root = await makeTempRoot();
    const chunk = async (name: string, bytes: number) => {
      const file = path.join(root, name);
      await writeText(file, "x".repeat(bytes));
      return file;
    };
    const [board, memo, shared, lazy] = await Promise.all([
      chunk("board.js", 100),
      chunk("memo.js", 200),
      chunk("shared.js", 400),
      chunk("lazy.js", 800),
    ]);
    const sizes = await new RouteRuntimePays().sizesOf(
      {
        entryOutputAbsByAbsPath: new Map([
          ["Board", board],
          ["Memo", memo],
        ]),
        graph: {
          importsByModule: new Map(),
          chunksByModule: new Map(),
          importsByChunk: new Map([
            [board, [shared]],
            [memo, [shared]],
            [lazy, []],
          ]),
        },
      },
      new Map([
        ["/both", ["Board", "Memo"]],
        ["/memo", ["Memo"]],
      ]),
    );
    expect(Object.fromEntries(sizes)).toEqual({ "/both": 700, "/memo": 600 });
  });
});
