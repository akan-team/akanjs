import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { AppWorkerPath } from "akanjs/server/appWorkerPath";
import { AkanWorkers } from "./akanWorkers";

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
    const workers = AkanWorkers.declare({ vision: "visionWorker.ts" }, owner, "/repo/apps/face");

    expect(AppWorkerPath.sources()).toEqual(workers);
    AkanWorkers.declare(undefined, owner, "/repo/apps/face");
    expect(process.env[AppWorkerPath.envKey]).toBeUndefined();
  });
});
