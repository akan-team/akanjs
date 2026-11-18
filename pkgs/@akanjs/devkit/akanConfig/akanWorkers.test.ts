import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { AppWorkerPath } from "akanjs/server/appWorkerPath";
import { AkanWorkers, type LibWorkers } from "./akanWorkers";

const owner = "apps/face/akan.config.ts";
const published = process.env[AppWorkerPath.envKey];

afterEach(() => {
  if (published === undefined) delete process.env[AppWorkerPath.envKey];
  else process.env[AppWorkerPath.envKey] = published;
});

describe("AkanWorkers", () => {
  test("resolves each entry against the folder that declares it", () => {
    expect(AkanWorkers.parse({ vision: "srvkit/_vision/visionWorker.ts" }, owner, "/repo/apps/face")).toEqual({
      vision: path.resolve("/repo/apps/face/srvkit/_vision/visionWorker.ts"),
    });
    expect(AkanWorkers.parse(undefined, owner, "/repo/apps/face")).toEqual({});
  });

  test("refuses a name that is no file name and an entry that is no relative source file", () => {
    const parse = (declared: unknown) => () => AkanWorkers.parse(declared, owner, "/repo/apps/face");

    expect(parse(["vision"])).toThrow(`${owner}: workers maps each worker's name to its entry file`);
    expect(parse({ "../vision": "a.ts" })).toThrow("workers.../vision is not a name");
    expect(parse({ vision: "/abs/visionWorker.ts" })).toThrow("workers.vision must be a .ts or .js file");
    expect(parse({ vision: "srvkit/vision" })).toThrow("workers.vision must be a .ts or .js file");
    expect(parse({ vision: 1 })).toThrow("workers.vision must be a .ts or .js file");
  });

  test("publishes the sources a source run spawns from, and takes them back when none is declared", () => {
    const workers = AkanWorkers.parse({ vision: "visionWorker.ts" }, owner, "/repo/apps/face");

    expect(AkanWorkers.publish(AkanWorkers.select({ owner, workers }, [], []))).toEqual(workers);
    expect(AppWorkerPath.sources()).toEqual(workers);
    AkanWorkers.publish(AkanWorkers.select({ owner, workers: {} }, [], []));
    expect(process.env[AppWorkerPath.envKey]).toBeUndefined();
  });

  test("adds the workers of the libs named, and the declarer's own entry wins a name", () => {
    const libWorkers: LibWorkers[] = [
      {
        lib: "edge",
        workers: { vision: "/repo/libs/edge/srvkit/vision.worker.ts", encode: "/repo/libs/edge/encode.ts" },
      },
      { lib: "other", workers: { ocr: "/repo/libs/other/ocr.ts" } },
    ];
    const chosen = AkanWorkers.select({ owner, workers: { vision: "/repo/apps/face/vision.ts" } }, libWorkers, [
      "edge",
    ]);

    expect(Object.fromEntries(chosen)).toEqual({
      vision: { owner, entry: "/repo/apps/face/vision.ts" },
      encode: { owner: "libs/edge/akan.config.ts", entry: "/repo/libs/edge/encode.ts" },
    });
  });

  test("refuses one name two of the named libs declare differently, unless told to keep the first", () => {
    const libWorkers: LibWorkers[] = [
      { lib: "edge", workers: { vision: "/repo/libs/edge/vision.ts" } },
      { lib: "lab", workers: { vision: "/repo/libs/lab/vision.ts" } },
    ];
    const select = (libs: string[], strict?: boolean) =>
      AkanWorkers.select({ owner, workers: {} }, libWorkers, libs, { strict });

    expect(() => select(["edge", "lab"])).toThrow(
      `libs/edge/akan.config.ts and libs/lab/akan.config.ts declare workers.vision differently; declare it in ${owner} to pick one.`,
    );
    expect(select(["lab"]).get("vision")?.entry).toBe("/repo/libs/lab/vision.ts");
    expect(select(["edge", "lab"], false).get("vision")?.entry).toBe("/repo/libs/edge/vision.ts");
  });
});
