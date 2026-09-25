import { describe, expect, test } from "bun:test";
import { DevChangePlanner } from "../frontendBuild";
import { prepareDevWatchBatch } from "./devWatchBatch";

describe("prepareDevWatchBatch", () => {
  test("includes generated indexes in the same invalidate generation", () => {
    const root = "/repo";
    const changedFile = `${root}/libs/shared/common/foo.ts`;
    const generatedIndex = `${root}/libs/shared/common/index.ts`;
    const prepared = prepareDevWatchBatch({
      generation: 12,
      batch: { files: [changedFile], kinds: new Set(["code"]) },
      indexSync: { changedFiles: [generatedIndex], errors: [] },
      changePlanner: new DevChangePlanner({ workspaceRoot: root }),
    });

    expect(prepared.hasSyncErrors).toBe(false);
    expect(prepared.files).toEqual([changedFile, generatedIndex]);
    expect(prepared.event.generation).toBe(12);
    expect(prepared.event.files).toEqual(prepared.files);
    expect(prepared.event.devPlan?.generatedFiles).toEqual([generatedIndex]);
    expect(prepared.event.devPlan?.files).toEqual(prepared.files);
  });

  test.each([
    "common",
    "srvkit",
    "ui",
    "webkit",
  ])("keeps %s facet add/delete generated index in the same generation", (facet) => {
    const root = "/repo";
    const changedFile = `${root}/libs/shared/${facet}/tmpExample.ts`;
    const generatedIndex = `${root}/libs/shared/${facet}/index.ts`;
    const prepared = prepareDevWatchBatch({
      generation: 20,
      batch: { files: [changedFile], kinds: new Set(["code"]) },
      indexSync: { changedFiles: [generatedIndex], errors: [] },
      changePlanner: new DevChangePlanner({ workspaceRoot: root }),
    });

    expect(new Set(prepared.files)).toEqual(new Set([changedFile, generatedIndex]));
    expect(prepared.event.devPlan?.generatedFiles).toEqual([generatedIndex]);
    expect(prepared.event.devPlan?.roles).toContain("barrel");
    expect(prepared.event.devPlan?.actions).toContain("sync-generated");
  });

  test("marks failed generated index sync as an error generation", () => {
    const root = "/repo";
    const prepared = prepareDevWatchBatch({
      generation: 13,
      batch: { files: [`${root}/libs/shared/common/foo.ts`], kinds: new Set(["code"]) },
      indexSync: { changedFiles: [], errors: ["sync failed"] },
      changePlanner: new DevChangePlanner({ workspaceRoot: root }),
    });

    expect(prepared.hasSyncErrors).toBe(true);
    expect(prepared.event.devPlan?.actions).toContain("report-error");
  });
});
