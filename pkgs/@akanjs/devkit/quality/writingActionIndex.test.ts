import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { SignalMutationIndex } from "./signalMutationIndex";
import { WritingActionIndex } from "./writingActionIndex";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
});

const signals = [
  fileOf(
    "apps/demo/lib/court/court.signal.ts",
    `export class CourtSlice extends slice(srv.court, { guards: { root: Admin, cru: User } }, () => ({})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ query, mutation }) => ({
  courtCount: query(Int, { guards: [User] }).exec(() => 0),
})) {}
`,
  ),
  fileOf(
    "libs/shared/lib/push/push.signal.ts",
    `export class PushEndpoint extends endpoint(srv.push, ({ mutation }) => ({
  pushPcCommand: mutation(Boolean, { guards: [User] }).param("courtId", ID).exec(() => true),
})) {}
`,
  ),
];

const courtStore = fileOf(
  "apps/demo/lib/court/court.store.ts",
  `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  async countCourts() {
    this.set({ count: await fetch.courtCount() });
  }
  async openCourt(courtId: string) {
    const root = this as unknown as RootStore;
    await root.restartPc(courtId);
  }
  async refreshAfterOpen(courtId: string) {
    await this.openCourt(courtId);
    await this.countCourts();
  }
}
`,
);
const pcStore = fileOf(
  "apps/demo/lib/_pc/pc.store.ts",
  `import { fetch, sig } from "../useClient";
export class PcStore extends store(sig.pc, () => ({})) {
  async restartPc(courtId: string) {
    await PcStore.sendRestart(courtId);
  }
  static async sendRestart(courtId: string) {
    await fetch.pushPcCommand(courtId);
  }
}
`,
);

const indexOf = (storeFiles: SourceFileInfo[]) => new WritingActionIndex(new SignalMutationIndex(signals), storeFiles);

describe("WritingActionIndex", () => {
  test("holds the generated actions that send a mutation for a model with a slice, not its form setters", () => {
    const index = indexOf([courtStore, pcStore]);
    for (const name of [
      "createCourt",
      "updateCourt",
      "removeCourt",
      "mergeCourt",
      "createCourtInForm",
      "updateCourtInForm",
      "submitCourt",
    ])
      expect(index.isWritingAction(name)).toBe(true);
    for (const name of ["setNameOnCourt", "writeOnCourt", "uploadImageOnCourt", "newCourt", "editCourt", "viewCourt"])
      expect(index.isWritingAction(name)).toBe(false);
    expect(index.isWritingAction("createPc")).toBe(false);
  });

  test("follows writes through a static helper, the RootStore alias and a sibling action to a fixed point", () => {
    const index = indexOf([courtStore, pcStore]);

    expect(index.isWritingAction("restartPc")).toBe(true);
    expect(index.isWritingAction("openCourt")).toBe(true);
    expect(index.isWritingAction("refreshAfterOpen")).toBe(true);
    expect(index.isWritingAction("countCourts")).toBe(false);
  });

  test("knows no action of a store it was not given", () => {
    const index = indexOf([courtStore]);

    expect(index.isWritingAction("restartPc")).toBe(false);
    expect(index.isWritingAction("openCourt")).toBe(false);
  });
});
