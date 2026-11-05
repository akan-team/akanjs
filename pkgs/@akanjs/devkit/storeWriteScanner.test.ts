import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { SignalMutationIndex } from "./signalMutationIndex";
import { StoreWriteScanner } from "./storeWriteScanner";
import { WritingActionIndex } from "./writingActionIndex";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
});

const signal = fileOf(
  "apps/demo/lib/court/court.signal.ts",
  `
export class CourtSlice extends slice(srv.court, { guards: { root: Admin, get: Public, cru: User } }, () => ({})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ query, mutation }) => ({
  assignCourtPc: mutation(cnst.Court, { guards: [User] }).param("courtId", ID).exec(async function (courtId) {
    return await this.courtService.assignPc(courtId);
  }),
  pushPcCommand: mutation(Boolean, { guards: [User] }).param("courtId", ID).exec(async function (courtId) {
    return await this.courtService.pushPcCommand(courtId);
  }),
  courtCount: query(Int, { guards: [User] }).exec(async function () {
    return 0;
  }),
})) {}
`,
);

const storeOf = (body: string) =>
  fileOf(
    "apps/demo/lib/court/court.store.ts",
    `import { store } from "akanjs/store";\nimport * as cnst from "../cnst";\nimport { fetch, sig } from "../useClient";\n\nexport class CourtStore extends store(sig.court, () => ({ count: 0 })) {\n${body}\n}\n`,
  );

const scan = (store: SourceFileInfo, otherStores: SourceFileInfo[] = []) =>
  new StoreWriteScanner(new WritingActionIndex(new SignalMutationIndex([signal]), [store, ...otherStores])).scan(store);

const pushStore = fileOf(
  "apps/demo/lib/push/push.store.ts",
  `import { fetch, sig } from "../useClient";
export class PushStore extends store(sig.push, () => ({})) {
  async pushCommandOnPc(courtId: string) {
    await fetch.pushPcCommand(courtId);
  }
  async countPushes() {
    return await fetch.courtCount();
  }
}
`,
);

describe("StoreWriteScanner", () => {
  test("reports an action sending two mutations at the second one", () => {
    const writes = scan(
      storeOf(`  async assignCourtPcOnCourt(courtId: string) {
    const court = await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(court.id);
    this.setCourt(court);
  }`),
    );
    expect(writes).toEqual([
      {
        action: "assignCourtPcOnCourt",
        line: 8,
        writes: ["fetch.assignCourtPc", "fetch.pushPcCommand"],
        writeCount: 2,
        isRootChain: false,
      },
    ]);
  });

  test("reads a mutation and a query, or a model read, as one write", () => {
    const writes = scan(
      storeOf(`  async refreshCourt(courtId: string) {
    const court = await fetch.assignCourtPc(courtId);
    this.set({ count: await fetch.courtCount() });
    this.setCourt(await fetch.court(court.id));
  }`),
    );
    expect(writes).toEqual([]);
  });

  test("reads writes on exclusive branches as one", () => {
    const writes = scan(
      storeOf(`  async pushOnCourt(courtId: string, many: boolean) {
    if (many) await fetch.assignCourtPc(courtId);
    else await fetch.pushPcCommand(courtId);
  }`),
    );
    expect(writes).toEqual([]);
  });

  test("counts the generated CRUD and a write inside a nested callback", () => {
    const writes = scan(
      storeOf(`  async mergeCourts(courtIds: string[]) {
    await Promise.all(courtIds.map(async (courtId) => fetch.mergeCourt(courtId, {})));
    setTimeout(() => void fetch["pushPcCommand"](courtIds[0]), 0);
  }`),
    );
    expect(writes.map(({ action, writes }) => ({ action, writes }))).toEqual([
      { action: "mergeCourts", writes: ["fetch.mergeCourt (per item)", 'fetch["pushPcCommand"]'] },
    ]);
  });

  test("reads one write per item as two, in a loop or a per-element callback, but not the list it loops over", () => {
    const writes = scan(
      storeOf(`  async removeCourts(courtIds: string[]) {
    for (const courtId of courtIds) await fetch.mergeCourt(courtId, {});
  }
  async pushToEach(courtIds: string[]) {
    await Promise.all(courtIds.map((courtId) => fetch.pushPcCommand(courtId)));
  }
  async assignOnce(courtId: string) {
    for (const pc of [await fetch.assignCourtPc(courtId)]) this.setCourt(pc);
  }`),
    );
    expect(writes.map(({ action, writes, writeCount }) => ({ action, writes, writeCount }))).toEqual([
      { action: "removeCourts", writes: ["fetch.mergeCourt (per item)"], writeCount: 2 },
      { action: "pushToEach", writes: ["fetch.pushPcCommand (per item)"], writeCount: 2 },
    ]);
  });

  test("counts a call to another writing action of the same store", () => {
    const writes = scan(
      storeOf(`  async pushCommandOnCourt(courtId: string) {
    await fetch.pushPcCommand(courtId);
  }
  async readCourt(courtId: string) {
    return fetch.court(courtId);
  }
  async assignCourtPcOnCourt(courtId: string) {
    await this.readCourt(courtId);
    await fetch.assignCourtPc(courtId);
    await this.pushCommandOnCourt(courtId);
  }`),
    );
    expect(writes).toEqual([
      {
        action: "assignCourtPcOnCourt",
        line: 15,
        writes: ["fetch.assignCourtPc", "this.pushCommandOnCourt"],
        writeCount: 2,
        isRootChain: false,
      },
    ]);
  });

  test("counts a generated CRUD action of the store's own model as its own write", () => {
    const writes = scan(
      storeOf(`  async createAndPushCourt(courtId: string) {
    await this.createCourt({ name: courtId });
    await fetch.pushPcCommand(courtId);
  }`),
    );
    expect(writes).toMatchObject([
      { action: "createAndPushCourt", writes: ["this.createCourt", "fetch.pushPcCommand"] },
    ]);
    expect(writes[0]?.isRootChain).toBe(false);
  });

  test("reads another store's writing action through the RootStore cast, an alias of it or a RootStore parameter", () => {
    const writes = scan(
      storeOf(`  async assignAndPush(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await (this as unknown as RootStore).pushCommandOnPc(courtId);
  }
  async assignThroughAlias(courtId: string) {
    const root = this as unknown as RootStore;
    await root.countPushes();
    await fetch.assignCourtPc(courtId);
    await root.pushCommandOnPc(courtId);
  }
  static async assignFrom(root: RootStore, courtId: string) {
    await root.assignCourtPcOnCourt(courtId);
    await root.pushCommandOnPc(courtId);
  }
  async assignCourtPcOnCourt(courtId: string) {
    await fetch.assignCourtPc(courtId);
  }`),
      [pushStore],
    );
    expect(writes.map(({ action, writes, isRootChain }) => ({ action, writes, isRootChain }))).toEqual([
      {
        action: "assignAndPush",
        writes: ["fetch.assignCourtPc", "(this as unknown as RootStore).pushCommandOnPc"],
        isRootChain: true,
      },
      { action: "assignThroughAlias", writes: ["fetch.assignCourtPc", "root.pushCommandOnPc"], isRootChain: true },
      { action: "assignFrom", writes: ["root.assignCourtPcOnCourt", "root.pushCommandOnPc"], isRootChain: true },
    ]);
  });

  test("counts a call to a writing static helper, and the writes a callback hands it", () => {
    const writes = scan(
      storeOf(`  static async guarded(root: RootStore, write: () => Promise<void>) {
    await write();
    void root.countPushes();
  }
  static async assignOnce(root: RootStore, courtId: string) {
    await fetch.assignCourtPc(courtId);
  }
  async assignAndPush(courtId: string) {
    const root = this as unknown as RootStore;
    await CourtStore.assignOnce(root, courtId);
    await CourtStore.guarded(root, () => root.pushCommandOnPc(courtId));
  }`),
      [pushStore],
    );
    expect(writes).toMatchObject([
      {
        action: "assignAndPush",
        writes: ["CourtStore.assignOnce", "root.pushCommandOnPc"],
        isRootChain: true,
      },
    ]);
  });

  test("reads a recursive call as no write, and a static helper's own writes as a chain", () => {
    const writes = scan(
      storeOf(`  async undoOnCourt(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await this.undoOnCourt(courtId);
  }
  static async sync(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(courtId);
  }`),
    );
    expect(writes.map(({ action, isRootChain }) => ({ action, isRootChain }))).toEqual([
      { action: "sync", isRootChain: false },
    ]);
  });

  test("ignores getters, class-property arrows and classes that are not stores", () => {
    const writes = scan(
      fileOf(
        "apps/demo/lib/court/court.store.ts",
        `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  get both() {
    void fetch.assignCourtPc("a");
    void fetch.pushPcCommand("a");
    return true;
  }
  assignBoth = async (courtId: string) => {
    await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(courtId);
  };
}
export class Helper extends Base {
  async run(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(courtId);
  }
}`,
      ),
    );
    expect(writes).toEqual([]);
  });

  test("reads nothing from a store that does not import fetch", () => {
    const store = fileOf(
      "apps/demo/lib/court/court.store.ts",
      `export class CourtStore extends store(sig.court, () => ({})) {
  async run(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(courtId);
  }
}`,
    );
    expect(scan(store)).toEqual([]);
  });
});
