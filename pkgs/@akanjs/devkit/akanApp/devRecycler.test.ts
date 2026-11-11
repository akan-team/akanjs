import { describe, expect, test } from "bun:test";
import type { Logger } from "akanjs/common";
import type { BuilderMessage, DevBuildStatus } from "akanjs/server";
import type { App } from "../commandDecorators";
import type { BackendImportGraph } from "./BackendImportGraph";
import type { BuilderGap } from "./builderGap";
import type { BuilderRssRecycler } from "./builderRssRecycler";
import type { DevBackend } from "./devBackend";
import type { DevBuilder } from "./devBuilder";
import type { DevBuildStatusBoard } from "./devBuildStatusBoard";
import { DevRecycler } from "./devRecycler";

const logger = { verbose: () => undefined, warn: () => undefined, info: () => undefined } as unknown as Logger;

const restartBuilder = {
  type: "invalidate",
  kinds: ["code"],
  files: ["/repo/libs/shared/common/foo.ts"],
  generation: 7,
  devPlan: {
    generation: 7,
    files: ["/repo/libs/shared/common/foo.ts"],
    generatedFiles: [],
    roles: ["shared"],
    actions: ["restart-builder"],
    reasonByFile: {},
  },
} as unknown as Extract<BuilderMessage, { type: "invalidate" }>;

describe("DevRecycler", () => {
  test("defers a builder restart while its generation's build is failing", async () => {
    const recorded: DevBuildStatus[] = [];
    const queued: DevBuildStatus[] = [];
    const touched: string[] = [];
    const recycler = new DevRecycler({} as App, {
      env: {},
      logger,
      isStopping: () => false,
      graph: {} as BackendImportGraph,
      statuses: {
        failedAt: (generation: number) => generation === 7,
        record: (status: DevBuildStatus) => recorded.push(status),
      } as unknown as DevBuildStatusBoard,
      backend: {
        sendOrQueueStatus: (status: DevBuildStatus) => queued.push(status),
        send: () => touched.push("backend.send"),
        scheduleRestart: () => touched.push("backend.scheduleRestart"),
        stop: () => touched.push("backend.stop"),
      } as unknown as DevBackend,
      builder: {
        stop: () => touched.push("builder.stop"),
        start: () => touched.push("builder.start"),
      } as unknown as DevBuilder,
      gap: {} as BuilderGap,
      rss: { rearm: () => undefined } as unknown as BuilderRssRecycler,
    });

    await recycler.handleInvalidate(restartBuilder);

    expect(recycler.pending).toBe(true);
    expect(touched).toEqual([]);
    expect(recorded).toHaveLength(1);
    expect(queued).toEqual(recorded);
    expect(recorded[0]).toMatchObject({ generation: 7, phase: "scan", ok: false, files: restartBuilder.files });
  });
});
