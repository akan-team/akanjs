import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { MaintainabilityBaseline } from "./maintainabilityBaseline";
import { MaintainabilityContract } from "./maintainabilityContract";
import { MaintainabilityLimits } from "./maintainabilityLimits";
import { tempDirs, writeText } from "./testHelpers";

const makeTempRoot = tempDirs("akan-maintainability-");

const makeWorkspace = async (files: Record<string, string>) => {
  const root = await makeTempRoot();
  for (const [filePath, content] of Object.entries(files)) await writeText(path.join(root, filePath), content);
  return root;
};

const linesOf = (lineNum: number) => Array.from({ length: lineNum }, (_, idx) => `// line ${idx}`).join("\n");
const componentOf = (name: string, lineNum: number) =>
  `export const ${name} = () => {\n${linesOf(lineNum - 3)}\n  return null;\n};\n`;

const signal = `export class CourtSlice extends slice(srv.court, { guards: { root: Admin, cru: User } }, () => ({})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ mutation }) => ({
  assignCourtPc: mutation(Boolean, { guards: [User] }).param("courtId", ID).exec(() => true),
})) {}
`;
const multiWriteStore = `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  async assignCourtPcOnCourt(courtId: string) {
    await fetch.assignCourtPc(courtId);
    await fetch.pushPcCommand(courtId);
  }
}
`;
const pushSignal = `export class PushEndpoint extends endpoint(srv.push, ({ mutation }) => ({
  pushPcCommand: mutation(Boolean, { guards: [User] }).param("courtId", ID).exec(() => true),
})) {}
`;

const contractOf = (root: string, libNames: string[] = []) =>
  new MaintainabilityContract(root, { type: "app", name: "demo" }, libNames);
const baselineOf = async (root: string) => await readFile(path.join(root, "apps/demo/akan.baseline.json"), "utf8");
const lineEntryOf = (text: string, key: string) =>
  MaintainabilityBaseline.parse(text).sections.get("akan.size.file")?.get(key);
const writeBaseline = async (root: string, json: object) =>
  await writeText(path.join(root, "apps/demo/akan.baseline.json"), `${JSON.stringify(json, null, 2)}\n`);

const git = async (root: string, ...args: string[]) => {
  const proc = Bun.spawn(
    ["git", "-c", "user.name=akan", "-c", "user.email=akan@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, stdout: "ignore", stderr: "pipe" },
  );
  if ((await proc.exited) !== 0) throw new Error(await new Response(proc.stderr).text());
};
const commitAll = async (root: string) => {
  await git(root, "init", "-q", "-b", "main");
  await git(root, "add", "-A");
  await git(root, "commit", "-q", "-m", "baseline");
};

describe("MaintainabilityContract limits", () => {
  test("holds each file kind to its line limit, the abstract to AbstractDoc's", async () => {
    const atLimit = Object.fromEntries(
      Object.entries(MaintainabilityLimits.fileMaxLines).map(([suffix, maxLines]) => [
        `apps/demo/lib/court/at${suffix}`,
        linesOf(maxLines),
      ]),
    );
    const overLimit = Object.fromEntries(
      Object.entries(MaintainabilityLimits.fileMaxLines).map(([suffix, maxLines]) => [
        `apps/demo/lib/court/over${suffix}`,
        linesOf(maxLines + 1),
      ]),
    );
    const root = await makeWorkspace({ ...atLimit, ...overLimit, "apps/demo/lib/court/court.signal.ts": linesOf(900) });

    const violations = await contractOf(root).measure();

    expect(MaintainabilityLimits.fileMaxLines[".abstract.md"]).toBe(300);
    expect(violations.map(({ key, line }) => ({ key, line }))).toEqual(
      Object.keys(overLimit)
        .map((file) => ({ key: file.slice("apps/demo/".length), line: 1 }))
        .sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    expect(violations.find(({ key }) => key.endsWith(".service.ts"))).toMatchObject({ lineCount: 501, maxLines: 500 });
  });

  test("measures components and hooks in lib/, ui/ and webkit/ only, keyed file#Component", async () => {
    const root = await makeWorkspace({
      "apps/demo/ui/Board.tsx": `${componentOf("Board", 251)}${componentOf("Cell", 120)}`,
      "apps/demo/lib/court/Court.Unit.tsx": `import { cn } from "akanjs/client";\n${componentOf("Card", 260)}`,
      "apps/demo/webkit/useBoard.tsx": componentOf("useBoard", 255),
      "apps/demo/page/court.tsx": componentOf("Page", 300),
      "apps/demo/ui/Board.test.tsx": componentOf("Fixture", 300),
    });

    const violations = await contractOf(root).measure();

    expect(violations).toEqual([
      {
        kind: "size",
        rule: "akan.size.component",
        key: "lib/court/Court.Unit.tsx#Card",
        file: "lib/court/Court.Unit.tsx",
        line: 2,
        lineCount: 260,
        maxLines: 250,
        component: "Card",
      },
      {
        kind: "size",
        rule: "akan.size.component",
        key: "ui/Board.tsx#Board",
        file: "ui/Board.tsx",
        line: 1,
        lineCount: 251,
        maxLines: 250,
        component: "Board",
      },
      {
        kind: "size",
        rule: "akan.size.component",
        key: "webkit/useBoard.tsx#useBoard",
        file: "webkit/useBoard.tsx",
        line: 1,
        lineCount: 255,
        maxLines: 250,
        component: "useBoard",
      },
    ]);
  });

  test("holds every ui/ and webkit/ source to the folder cap, leaving out tests, specs and re-export barrels", async () => {
    const cap = MaintainabilityLimits.folderMaxLines["ui/"];
    const barrel = Array.from({ length: cap + 50 }, (_, idx) => `export * from "./part${idx}";`).join("\n");
    const root = await makeWorkspace({
      "apps/demo/ui/Big.tsx": linesOf(cap + 1),
      "apps/demo/ui/Fits.tsx": linesOf(cap),
      "apps/demo/ui/Grid/index.ts": Array.from({ length: cap + 1 }, (_, idx) => `export const v${idx} = ${idx};`).join(
        "\n",
      ),
      "apps/demo/ui/index.ts": barrel,
      "apps/demo/ui/Big.test.tsx": linesOf(cap + 100),
      "apps/demo/webkit/useBoard.tsx": linesOf(cap + 2),
      "apps/demo/webkit/boardLayout.ts": linesOf(cap + 3),
      "apps/demo/webkit/boardLayout.spec.ts": linesOf(cap + 100),
      "apps/demo/webkit/index.ts": `${barrel}\nexport {};`,
      "apps/demo/common/table.ts": linesOf(cap + 100),
    });

    const violations = await contractOf(root).measure();

    expect(MaintainabilityLimits.folderMaxLines["webkit/"]).toBe(cap);
    expect(violations).toMatchObject([
      { rule: "akan.size.file", key: "ui/Big.tsx", lineCount: cap + 1, maxLines: cap },
      { rule: "akan.size.file", key: "ui/Grid/index.ts", lineCount: cap + 1, maxLines: cap },
      { rule: "akan.size.file", key: "webkit/boardLayout.ts", lineCount: cap + 3, maxLines: cap },
      { rule: "akan.size.file", key: "webkit/useBoard.tsx", lineCount: cap + 2, maxLines: cap },
    ]);
    expect(violations).toHaveLength(4);
  });

  test("reads a store's mutations from its own signals and the libs it reaches", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": signal,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
      "libs/shared/lib/push/push.signal.ts": pushSignal,
    });

    expect(await contractOf(root).measure()).toEqual([]);
    expect(await contractOf(root, ["shared"]).measure()).toEqual([
      {
        kind: "multiWrite",
        rule: "akan.store.multi-write",
        key: "lib/court/court.store.ts#assignCourtPcOnCourt",
        file: "lib/court/court.store.ts",
        line: 5,
        owner: "assignCourtPcOnCourt",
        writes: ["fetch.assignCourtPc", "fetch.pushPcCommand"],
        writeCount: 2,
      },
    ]);
  });
});

describe("MaintainabilityContract ratchet", () => {
  const zone = "apps/demo/lib/court/Court.Zone.tsx";

  test("fails a breach the baseline does not record, and one that grew past its entry", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450), "apps/demo/lib/court/Court.View.tsx": linesOf(500) });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 440 } });

    const failures = await contractOf(root).enforce({ fix: false });

    expect(failures).toMatchObject([
      { key: "lib/court/Court.View.tsx", lineCount: 500 },
      { key: "lib/court/Court.Zone.tsx", lineCount: 450, recorded: 440 },
    ]);
  });

  test("passes a breach at its entry and a listed multi-write, writing nothing", async () => {
    const root = await makeWorkspace({
      [zone]: linesOf(450),
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    const baseline = {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 450 },
      "akan.store.multi-write": { "lib/court/court.store.ts#assignCourtPcOnCourt": 2 },
    };
    await writeBaseline(root, baseline);
    const before = await baselineOf(root);

    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineOf(root)).toBe(before);
  });

  test("tightens a shrunk entry and drops a fixed or deleted one, only with fix", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(420), "apps/demo/lib/court/Court.View.tsx": linesOf(300) });
    await writeBaseline(root, {
      "akan.size.file": {
        "lib/court/Court.Zone.tsx": 450,
        "lib/court/Court.View.tsx": 480,
        "lib/gone/Gone.Zone.tsx": 900,
      },
      "akan.store.multi-write": { "lib/court/court.store.ts#assignCourtPcOnCourt": 2 },
    });
    const before = await baselineOf(root);

    expect(await contractOf(root).enforce({ fix: false })).toEqual([]);
    expect(await baselineOf(root)).toBe(before);

    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineOf(root)).toBe('{\n  "akan.size.file": {\n    "lib/court/Court.Zone.tsx": 420\n  }\n}\n');

    await writeText(path.join(root, zone), linesOf(400));
    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(existsSync(path.join(root, "apps/demo/akan.baseline.json"))).toBe(false);
  });

  test("refuses a working baseline that adds or raises an entry over the committed one", async () => {
    const root = await makeWorkspace({
      [zone]: linesOf(450),
      "apps/demo/lib/court/Court.View.tsx": linesOf(500),
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 440 } });
    await commitAll(root);
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 460, "lib/court/Court.View.tsx": 500 },
      "akan.store.multi-write": { "lib/court/court.store.ts#assignCourtPcOnCourt": 2 },
    });

    const failures = await contractOf(root).enforce({ fix: false });

    expect(failures).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.Zone.tsx", count: 460, committed: 440, line: 3 },
      { kind: "baselineGrowth", key: "lib/court/Court.View.tsx", file: "akan.baseline.json", line: 4 },
      {
        kind: "baselineGrowth",
        key: "lib/court/court.store.ts#assignCourtPcOnCourt",
        debtRule: "akan.store.multi-write",
        line: 7,
      },
    ]);
    expect(failures).toHaveLength(3);
    expect(contractOf(root).describe(failures)).toMatch(
      /apps\/demo\/akan\.baseline\.json:3 {2}akan\.baseline\.growth {2}entry "lib\/court\/Court\.Zone\.tsx" under akan\.size\.file allows 460 lines, above the 440 at [0-9a-f]{12}; the baseline may only shrink/,
    );
  });

  test("measures growth from the fork point with the default branch, so a raise the branch committed still fails", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450) });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 440 } });
    await commitAll(root);
    await git(root, "checkout", "-q", "-b", "feature");
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 460 } });
    await git(root, "commit", "-q", "-am", "raise");

    expect(await contractOf(root).enforce({ fix: false })).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.Zone.tsx", count: 460, committed: 440 },
    ]);
  });

  test("refuses headroom a baseline left unfixed records above what the code measures", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450), "apps/demo/lib/court/Court.View.tsx": linesOf(10) });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 450 } });
    await commitAll(root);
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 900, "lib/court/Court.View.tsx": 900 },
    });

    expect(await contractOf(root).enforce({ fix: false })).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.Zone.tsx", count: 900, committed: 450 },
      { kind: "baselineGrowth", key: "lib/court/Court.View.tsx", count: 900, committed: undefined },
    ]);
    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineOf(root)).toBe('{\n  "akan.size.file": {\n    "lib/court/Court.Zone.tsx": 450\n  }\n}\n');
  });

  test("fails where the fork point cannot be found, instead of comparing the baseline with itself", async () => {
    const origin = await makeWorkspace({ [zone]: linesOf(450) });
    await writeBaseline(origin, { "akan.size.file": { "lib/court/Court.Zone.tsx": 440 } });
    await commitAll(origin);
    await git(origin, "checkout", "-q", "-b", "feature");
    await writeBaseline(origin, { "akan.size.file": { "lib/court/Court.Zone.tsx": 460 } });
    await git(origin, "commit", "-q", "-am", "raise");
    const shallow = await makeTempRoot();
    await git(shallow, "init", "-q");
    await git(shallow, "fetch", "-q", "--depth=1", `file://${origin}`, "+refs/heads/feature:refs/remotes/pull/1/merge");
    await git(shallow, "checkout", "-q", "--detach", "refs/remotes/pull/1/merge");

    await expect(contractOf(shallow).enforce({ fix: false })).rejects.toThrow(
      "apps/demo/akan.baseline.json is compared with its copy where this branch forked from the default branch, but this is a shallow clone",
    );

    await git(origin, "checkout", "-q", "--orphan", "unrelated");
    await git(origin, "commit", "-q", "-m", "unrelated");
    await expect(contractOf(origin).enforce({ fix: false })).rejects.toThrow("HEAD shares no commit with main");
  });

  test("reads a reference baseline holding a section this version does not know", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450) });
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 450 },
      "akan.size.retired": { "lib/court/Court.Zone.tsx": 2 },
    });
    await commitAll(root);
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 450 } });

    expect(await contractOf(root).enforce({ fix: false })).toEqual([]);
  });

  test("passes a shape entry added or raised with a reason, and refuses a chained write whatever its reason", async () => {
    const root = await makeWorkspace({
      [zone]: linesOf(450),
      "apps/demo/lib/court/Court.View.tsx": linesOf(500),
      "apps/demo/ui/Board.tsx": linesOf(420),
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 440 } });
    await commitAll(root);
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 450, "lib/court/Court.View.tsx": 500, "ui/Board.tsx": 420 },
      "akan.store.multi-write": { "lib/court/court.store.ts#assignCourtPcOnCourt": 2 },
      reasons: {
        "lib/court/Court.Zone.tsx": "The court canvas is one pointer state machine.",
        "ui/Board.tsx": "Generated SVG path table for the court layout.",
        "lib/court/Court.View.tsx": "a b c d e f g h i",
        "lib/court/court.store.ts#assignCourtPcOnCourt": "Assigning and pushing must stay two calls for now.",
      },
    });
    const contract = contractOf(root);

    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.View.tsx", count: 500, committed: undefined },
      { kind: "baselineGrowth", key: "lib/court/court.store.ts#assignCourtPcOnCourt" },
    ]);
    expect(failures).toHaveLength(2);
    expect(contract.describe(failures)).not.toContain("reason");
  });

  test("lowers a reasoned entry as its file shrinks, and drops it with its reason once it passes", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(420), "apps/demo/lib/court/Court.View.tsx": linesOf(300) });
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 450, "lib/court/Court.View.tsx": 480 },
      reasons: {
        "lib/court/Court.Zone.tsx": "The court canvas is one pointer state machine.",
        "lib/court/Court.View.tsx": "The schedule grid renders every slot inline.",
        "lib/gone/Gone.Zone.tsx": "A file deleted long ago kept this reason.",
      },
    });

    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineOf(root)).toBe(`{
  "akan.size.file": {
    "lib/court/Court.Zone.tsx": 420
  },
  "reasons": {
    "lib/court/Court.Zone.tsx": "The court canvas is one pointer state machine."
  }
}
`);

    await writeText(path.join(root, zone), linesOf(400));
    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(existsSync(path.join(root, "apps/demo/akan.baseline.json"))).toBe(false);
  });

  test("lets a committed baseline shrink", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450) });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 460 } });
    await commitAll(root);
    await writeText(path.join(root, zone), linesOf(430));

    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(lineEntryOf(await baselineOf(root), "lib/court/Court.Zone.tsx")).toBe(430);
  });

  test("names each breach with its place, size and limit, and how to fix it", async () => {
    const root = await makeWorkspace({
      [zone]: `${componentOf("Canvas", 300)}${linesOf(150)}`,
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    const contract = contractOf(root);

    const message = contract.describe(await contract.enforce({ fix: false }));

    expect(message).toContain("[maintainability] 3 violation(s) in apps/demo:");
    expect(message).toContain(
      "apps/demo/lib/court/Court.Zone.tsx:1  akan.size.file  file has 450 lines, over the 400-line limit\n" +
        "  apps/demo/lib/court/Court.Zone.tsx:1  akan.size.component  component Canvas has 300 lines, over the 250-line limit\n" +
        "  apps/demo/lib/court/court.store.ts:5  akan.store.multi-write  store action assignCourtPcOnCourt sends 2 writes from the browser: fetch.assignCourtPc, fetch.pushPcCommand",
    );
    expect(message).toContain("*.Zone.tsx, component or hook: Split it, in this order: a mode/kind table");
    expect(message).toContain("this.transaction(fn)");
    expect(message).not.toContain("baseline");
    expect(message).not.toContain("Path:");
  });

  test("prints a rule's command under its fix once, and nothing for a rule the map leaves out", async () => {
    const root = await makeWorkspace({
      [zone]: linesOf(450),
      "apps/demo/lib/court/Court.Util.tsx": linesOf(410),
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    const contract = contractOf(root);
    const failures = await contract.enforce({ fix: false });
    const plan = "akan workflow plan add-mutation --app demo --module <module> --mutation <mutation> --guard <guard>";

    const message = contract.describe(failures, {
      "akan.store.multi-write": [plan],
      "akan.size.file": ["akan split <file>"],
    });

    expect(message).toContain(
      "never model-bound code moved into `ui/`.\n    Path: akan split <file>\n  store action with several writes:",
    );
    expect(message).toContain("  *.Util.tsx, *.Zone.tsx: Split it, in this order:");
    expect(message).toContain(`this.transaction(fn)\`, with a side effect`);
    expect(message.split("\n").filter((line) => line === `    Path: ${plan}`)).toHaveLength(1);
    expect(message.split("\n").filter((line) => line.startsWith("    Path:"))).toHaveLength(2);
  });
});

describe("MaintainabilityContract seed", () => {
  const zone = "apps/demo/lib/court/Court.Zone.tsx";

  test("records every breach where no baseline exists, and keeps an existing one unless forced", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(450) });

    expect((await contractOf(root).seed()).result).toBe("written");
    expect(await baselineOf(root)).toBe('{\n  "akan.size.file": {\n    "lib/court/Court.Zone.tsx": 450\n  }\n}\n');

    await writeText(path.join(root, zone), linesOf(470));
    expect((await contractOf(root).seed()).result).toBe("kept");
    expect(lineEntryOf(await baselineOf(root), "lib/court/Court.Zone.tsx")).toBe(450);
    expect((await contractOf(root).seed({ force: true })).result).toBe("written");
    expect(lineEntryOf(await baselineOf(root), "lib/court/Court.Zone.tsx")).toBe(470);

    await writeText(path.join(root, zone), linesOf(10));
    expect((await contractOf(root).seed({ force: true })).result).toBe("removed");
    expect(existsSync(path.join(root, "apps/demo/akan.baseline.json"))).toBe(false);
    expect((await contractOf(root).seed()).result).toBe("clean");
  });

  test("keeps the reasons of the entries a forced seed records again", async () => {
    const root = await makeWorkspace({ [zone]: linesOf(470) });
    await writeBaseline(root, {
      "akan.size.file": { "lib/court/Court.Zone.tsx": 450, "lib/gone/Gone.Zone.tsx": 900 },
      reasons: {
        "lib/court/Court.Zone.tsx": "The court canvas is one pointer state machine.",
        "lib/gone/Gone.Zone.tsx": "A file deleted long ago kept this reason.",
      },
    });

    expect((await contractOf(root).seed({ force: true })).result).toBe("written");
    expect(await baselineOf(root)).toBe(`{
  "akan.size.file": {
    "lib/court/Court.Zone.tsx": 470
  },
  "reasons": {
    "lib/court/Court.Zone.tsx": "The court canvas is one pointer state machine."
  }
}
`);
  });
});

describe("MaintainabilityContract rules", () => {
  test("lists every rule a failure can carry", async () => {
    expect(MaintainabilityContract.ruleIds).toEqual([
      "akan.size.file",
      "akan.size.component",
      "akan.size.function",
      "akan.size.class",
      "akan.store.multi-write",
      "akan.store.root-write-chain",
      "akan.component.write-chain",
      "akan.component.store-access",
      "akan.write.placement",
      "akan.service.call-in-loop",
      "akan.error.bare-error",
      "akan.baseline.growth",
    ]);
    const root = await makeWorkspace({
      "apps/demo/lib/court/Court.Zone.tsx": `${componentOf("Canvas", 260)}${linesOf(150)}`,
      "apps/demo/lib/court/court.signal.ts": `${signal}\n${pushSignal}`,
      "apps/demo/lib/court/court.store.ts": multiWriteStore,
    });
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 405 } });
    await commitAll(root);
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 600 } });

    const failures = await contractOf(root).enforce({ fix: false });

    expect(failures.map(({ rule }) => rule)).toEqual([
      "akan.baseline.growth",
      "akan.size.component",
      "akan.store.multi-write",
    ]);
    for (const { rule } of failures) expect(MaintainabilityContract.ruleIds).toContain(rule);
  });
});

describe("MaintainabilityContract write chains", () => {
  const courtStore = `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  async assignCourtPcOnCourt(courtId: string) {
    await fetch.assignCourtPc(courtId);
  }
  async assignAndPush(courtId: string) {
    const root = this as unknown as RootStore;
    await this.assignCourtPcOnCourt(courtId);
    await root.pushPcCommandOnCourt(courtId);
  }
}
`;
  const pushStore = `import { fetch, sig } from "../useClient";
export class PushStore extends store(sig.push, () => ({})) {
  async pushPcCommandOnCourt(courtId: string) {
    await fetch.pushPcCommand(courtId);
  }
}
`;
  const install = `"use client";
import { st } from "@apps/demo/client";

export const Install = ({ courtId }: { courtId: string }) => {
  const onAssign = async () => {
    await st.do.assignCourtPcOnCourt(courtId);
    await st.do.pushPcCommandOnCourt(courtId);
  };
  return <button type="button" onClick={() => void onAssign()} />;
};
`;

  test("reads a write through another store, the libs' stores included, in a store and in a component handler", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": signal,
      "apps/demo/lib/court/court.store.ts": courtStore,
      "apps/demo/lib/court/Court.Zone.tsx": install,
      "libs/shared/lib/push/push.signal.ts": pushSignal,
      "libs/shared/lib/push/push.store.ts": pushStore,
    });

    expect(await contractOf(root).measure()).toEqual([]);
    expect(await contractOf(root, ["shared"]).measure()).toEqual([
      {
        kind: "multiWrite",
        rule: "akan.component.write-chain",
        key: "lib/court/Court.Zone.tsx#Install",
        file: "lib/court/Court.Zone.tsx",
        line: 7,
        owner: "Install",
        writes: ["st.do.assignCourtPcOnCourt", "st.do.pushPcCommandOnCourt"],
        writeCount: 2,
      },
      {
        kind: "multiWrite",
        rule: "akan.store.root-write-chain",
        key: "lib/court/court.store.ts#assignAndPush",
        file: "lib/court/court.store.ts",
        line: 9,
        owner: "assignAndPush",
        writes: ["this.assignCourtPcOnCourt", "root.pushPcCommandOnCourt"],
        writeCount: 2,
      },
    ]);
  });

  test("passes a chain the baseline lists, and drops the entry once the chain is gone", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": signal,
      "apps/demo/lib/court/court.store.ts": courtStore,
      "apps/demo/lib/court/Court.Zone.tsx": install,
      "libs/shared/lib/push/push.signal.ts": pushSignal,
      "libs/shared/lib/push/push.store.ts": pushStore,
    });
    await writeBaseline(root, {
      "akan.store.root-write-chain": { "lib/court/court.store.ts#assignAndPush": 2 },
      "akan.component.write-chain": { "lib/court/Court.Zone.tsx#Install": 2 },
    });

    expect(await contractOf(root, ["shared"]).enforce({ fix: true })).toEqual([]);

    await writeText(
      path.join(root, "apps/demo/lib/court/Court.Zone.tsx"),
      install.replace(/\n.*pushPcCommandOnCourt.*\n/, "\n"),
    );
    expect(await contractOf(root, ["shared"]).enforce({ fix: true })).toEqual([]);
    expect([...MaintainabilityBaseline.parse(await baselineOf(root)).entriesByRule()]).toEqual([
      ["akan.store.root-write-chain", [{ key: "lib/court/court.store.ts#assignAndPush", count: 2, reason: undefined }]],
    ]);
  });
});

describe("MaintainabilityContract store access", () => {
  const zone = "apps/demo/lib/court/Court.Zone.tsx";
  const busyComponent = (accessNum: number) => `"use client";
import { st } from "@apps/demo/client";

export const Canvas = () => {
${Array.from({ length: accessNum }, (_, idx) => `  const v${idx} = st.use.court${idx}();`).join("\n")}
  return null;
};
`;

  test("fails a component over the cap, passes it at its entry, and lowers the entry as it shrinks", async () => {
    const cap = MaintainabilityLimits.componentMaxStoreAccesses;
    const root = await makeWorkspace({ [zone]: busyComponent(cap) });
    expect(await contractOf(root).measure()).toEqual([]);

    await writeText(path.join(root, zone), busyComponent(cap + 4));
    const contract = contractOf(root);
    const failures = await contract.enforce({ fix: false });
    expect(failures).toEqual([
      {
        kind: "storeAccess",
        rule: "akan.component.store-access",
        key: "lib/court/Court.Zone.tsx#Canvas",
        file: "lib/court/Court.Zone.tsx",
        line: 4,
        component: "Canvas",
        accessCount: cap + 4,
        maxAccesses: cap,
      },
    ]);
    expect(contract.describe(failures)).toContain(
      `apps/demo/lib/court/Court.Zone.tsx:4  akan.component.store-access  component Canvas reaches the store ${cap + 4} times, over the ${cap}-access limit`,
    );
    expect(contract.describe(failures)).toContain("webkit/use<X>.tsx");

    await writeBaseline(root, { "akan.component.store-access": { "lib/court/Court.Zone.tsx#Canvas": cap + 2 } });
    expect(await contractOf(root).enforce({ fix: false })).toMatchObject([{ accessCount: cap + 4, recorded: cap + 2 }]);

    await writeText(path.join(root, zone), busyComponent(cap + 1));
    expect(await contractOf(root).enforce({ fix: true })).toEqual([]);
    expect(
      MaintainabilityBaseline.parse(await baselineOf(root))
        .sections.get("akan.component.store-access")
        ?.get("lib/court/Court.Zone.tsx#Canvas"),
    ).toBe(cap + 1);
  });

  test("refuses a working entry raised over the committed one", async () => {
    const cap = MaintainabilityLimits.componentMaxStoreAccesses;
    const root = await makeWorkspace({ [zone]: busyComponent(cap + 3) });
    await writeBaseline(root, { "akan.component.store-access": { "lib/court/Court.Zone.tsx#Canvas": cap + 1 } });
    await commitAll(root);
    await writeBaseline(root, { "akan.component.store-access": { "lib/court/Court.Zone.tsx#Canvas": cap + 9 } });
    const contract = contractOf(root);

    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([
      { rule: "akan.baseline.growth", key: "lib/court/Court.Zone.tsx#Canvas", count: cap + 9, line: 3 },
    ]);
    expect(contract.describe(failures)).toContain(
      `entry "lib/court/Court.Zone.tsx#Canvas" under akan.component.store-access allows ${cap + 9} store accesses, above the ${cap + 1} at`,
    );
  });
});

describe("MaintainabilityContract write placement", () => {
  const courtStore = `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  async assignCourtPcOnCourt(courtId: string) {
    await fetch.assignCourtPc(courtId);
  }
  setPicked(courtId: string) {
    this.set({ picked: courtId });
  }
}
`;

  test("fails a write sent from ui/ or webkit/, or a fetch mutation outside a store, and passes a module component's st.do write", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": signal,
      "apps/demo/lib/court/court.store.ts": courtStore,
      "apps/demo/lib/court/Court.Zone.tsx": `"use client";
import { fetch, st } from "@apps/demo/client";

export const Assign = ({ courtId }: { courtId: string }) => (
  <>
    <button type="button" onClick={() => void st.do.assignCourtPcOnCourt(courtId)} />
    <button type="button" onClick={() => void fetch.assignCourtPc(courtId)} />
  </>
);
`,
      "apps/demo/ui/CourtPicker.tsx": `"use client";
import { st } from "@apps/demo/client";

export const CourtPicker = ({ courtId }: { courtId: string }) => (
  <button type="button" onClick={st.do.assignCourtPcOnCourt} onFocus={() => st.do.setPicked(courtId)} />
);
`,
      "apps/demo/webkit/useAssign.tsx": `"use client";
import { fetch } from "@apps/demo/client";

export const useAssign = () => ({ assign: async (courtId: string) => await fetch.assignCourtPc(courtId) });
`,
      "apps/demo/ui/Picker.tsx": `export const Picker = ({ onPick }: { onPick: () => void }) => (
  <button type="button" onClick={onPick} />
);
`,
    });

    const violations = (await contractOf(root).measure()).filter(({ rule }) => rule === "akan.write.placement");

    expect(violations).toEqual([
      {
        kind: "writePlacement",
        rule: "akan.write.placement",
        key: "lib/court/Court.Zone.tsx",
        file: "lib/court/Court.Zone.tsx",
        line: 7,
        writes: ["fetch.assignCourtPc"],
      },
      {
        kind: "writePlacement",
        rule: "akan.write.placement",
        key: "ui/CourtPicker.tsx",
        file: "ui/CourtPicker.tsx",
        line: 5,
        writes: ["st.do.assignCourtPcOnCourt"],
      },
      {
        kind: "writePlacement",
        rule: "akan.write.placement",
        key: "webkit/useAssign.tsx",
        file: "webkit/useAssign.tsx",
        line: 4,
        writes: ["fetch.assignCourtPc"],
      },
    ]);
  });

  test("counts a hook's store reads against the same cap as a component's", async () => {
    const cap = MaintainabilityLimits.componentMaxStoreAccesses;
    const root = await makeWorkspace({
      "apps/demo/webkit/useCourtState.tsx": `"use client";
import { st } from "@apps/demo/client";

export const useCourtState = () => {
${Array.from({ length: cap + 1 }, (_, idx) => `  const v${idx} = st.use.court${idx}();`).join("\n")}
  return { v0 };
};
`,
    });

    expect(await contractOf(root).measure()).toMatchObject([
      { rule: "akan.component.store-access", key: "webkit/useCourtState.tsx#useCourtState", accessCount: cap + 1 },
    ]);
  });
});

describe("MaintainabilityContract service calls per item", () => {
  const courtSignal = `export class CourtInternal extends internal(srv.court, ({ cron }) => ({
  sweep: cron("0 * * * *").exec(function () {
    return this.courtService.sweepAll();
  }),
})) {}
export class CourtSlice extends slice(srv.court, { guards: { root: Admin, cru: User } }, () => ({})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ mutation }) => ({
  assignPcs: mutation(Boolean, { guards: [User] }).body("courtIds", [ID]).exec(function (courtIds) {
    return this.courtService.assignPcs(courtIds);
  }),
})) {}
`;
  const courtService = `export class CourtService extends serve(db.court, ({ use }) => ({})) {
  async assignPcs(courtIds: string[]) {
    for (const courtId of courtIds) await this.#assign(courtId);
    const courts = await this.loadCourtMany(courtIds);
    return courts.length > 0;
  }
  async #assign(courtId: string) {
    const pc = await this.pcService.pickFree();
    await this.courtModel.assignPc(courtId, pc.id);
  }
  async retry(courtId: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) await this.courtModel.touch(courtId);
  }
  async sweepAll() {
    const courts = await this.listAll();
    await Promise.all(courts.map((court) => this.pcService.ping(court.pcId)));
  }
}
`;

  test("fails a service method an endpoint reaches that calls a service or the database per item, sparing jobs and counted loops", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": courtSignal,
      "apps/demo/lib/court/court.service.ts": courtService,
    });

    expect(await contractOf(root).measure()).toEqual([
      {
        kind: "loopCall",
        rule: "akan.service.call-in-loop",
        key: "lib/court/court.service.ts#assignPcs",
        file: "lib/court/court.service.ts",
        line: 3,
        owner: "assignPcs",
        calls: ["this.#assign"],
      },
    ]);
  });

  test("lets a reasoned entry stand for a per-item call a person decided on", async () => {
    const root = await makeWorkspace({
      "apps/demo/lib/court/court.signal.ts": courtSignal,
      "apps/demo/lib/court/court.service.ts": courtService,
    });
    await commitAll(root);
    await writeBaseline(root, {
      "akan.service.call-in-loop": { "lib/court/court.service.ts#assignPcs": 1 },
      reasons: { "lib/court/court.service.ts#assignPcs": "Each court takes a lock of its own; at most 4 per call." },
    });

    expect(await contractOf(root).enforce({ fix: false })).toEqual([]);
  });
});

describe("MaintainabilityContract packages", () => {
  const packageOf = (root: string) => new MaintainabilityContract(root, { type: "pkg", name: "@demo/core" });
  const functionOf = (name: string, lineNum: number) => `export function ${name}() {\n${linesOf(lineNum - 2)}\n}\n`;
  const classOf = (name: string, memberNum: number) =>
    `export class ${name} {\n${Array.from({ length: memberNum }, (_, idx) => `  field${idx} = ${idx};`).join("\n")}\n}\n`;

  test("holds a package file to 800 lines, a function to 150 and a class to 60 members, tests and barrels aside", async () => {
    const root = await makeWorkspace({
      "pkgs/@demo/core/server/host.ts": `${classOf("Host", 61)}${functionOf("boot", 151)}${linesOf(600)}`,
      "pkgs/@demo/core/server/atLimit.ts": `${classOf("Small", 60)}${functionOf("fits", 150)}${linesOf(800 - 212)}\n`,
      "pkgs/@demo/core/server/host.test.ts": `${functionOf("suite", 900)}`,
      "pkgs/@demo/core/server/host.fixture.ts": `${functionOf("fixture", 900)}`,
      "pkgs/@demo/core/server/host.instance.ts": `${functionOf("instance", 900)}`,
      "pkgs/@demo/core/test/helpers.ts": `${functionOf("helper", 900)}`,
      "pkgs/@demo/core/types.d.ts": linesOf(900),
      "pkgs/@demo/core/index.ts": Array.from({ length: 801 }, (_, idx) => `export * from "./m${idx}";`).join("\n"),
    });

    expect(await packageOf(root).measure()).toEqual([
      {
        kind: "size",
        rule: "akan.size.file",
        key: "server/host.ts",
        file: "server/host.ts",
        line: 1,
        lineCount: 814,
        maxLines: 800,
      },
      {
        kind: "size",
        rule: "akan.size.function",
        key: "server/host.ts#boot",
        file: "server/host.ts",
        line: 64,
        lineCount: 151,
        maxLines: 150,
        function: "boot",
      },
      {
        kind: "classSize",
        rule: "akan.size.class",
        key: "server/host.ts#Host",
        file: "server/host.ts",
        line: 1,
        owner: "Host",
        memberCount: 61,
        maxMembers: 60,
      },
    ]);
  });

  test("reads a package in a repository through git, so ignored output is never measured", async () => {
    const root = await makeWorkspace({
      ".gitignore": "**/dist\n",
      "pkgs/@demo/core/dist/bundle.ts": linesOf(900),
      "pkgs/@demo/core/server/committed.ts": linesOf(801),
    });
    await commitAll(root);
    await writeText(path.join(root, "pkgs/@demo/core/server/untracked.ts"), linesOf(802));

    expect((await packageOf(root).measure()).map(({ key }) => key)).toEqual([
      "server/committed.ts",
      "server/untracked.ts",
    ]);
  });

  test("measures nothing in a package git ignores whole, and leaves a package's examples out", async () => {
    const root = await makeWorkspace({
      ".gitignore": "pkgs/gen/\n",
      "pkgs/gen/package.json": "{}\n",
      "pkgs/gen/big.ts": functionOf("generated", 162),
      "pkgs/@demo/core/examples/sample/src/selftest.ts": functionOf("runSelftest", 900),
    });
    await commitAll(root);

    expect(await new MaintainabilityContract(root, { type: "pkg", name: "gen" }).measure()).toEqual([]);
    expect(await packageOf(root).measure()).toEqual([]);
  });

  test("numbers only the breaches sharing a name, so a short function above leaves a recorded key in place", async () => {
    const callbackOf = (receiver: string, lineNum: number) => `${receiver}.map(() => {\n${linesOf(lineNum - 2)}\n});\n`;
    const root = await makeWorkspace({
      "pkgs/@demo/core/run.ts": `ys.map(() => 1);\n${callbackOf("xs", 160)}${callbackOf("zs", 170)}`,
    });

    expect((await packageOf(root).measure()).map(({ key }) => key)).toEqual(["run.ts#map()", "run.ts#map()[2]"]);
  });

  test("records a package's breaches in its own baseline, which only shrinks from the default branch", async () => {
    const root = await makeWorkspace({ "pkgs/@demo/core/server/host.ts": functionOf("boot", 200) });

    expect((await packageOf(root).seed()).result).toBe("written");
    expect(await readFile(path.join(root, "pkgs/@demo/core/akan.baseline.json"), "utf8")).toBe(
      '{\n  "akan.size.function": {\n    "server/host.ts#boot": 200\n  }\n}\n',
    );
    await commitAll(root);
    await writeText(path.join(root, "pkgs/@demo/core/server/host.ts"), functionOf("boot", 210));

    const contract = packageOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([{ rule: "akan.size.function", key: "server/host.ts#boot", recorded: 200 }]);
    expect(contract.describe(failures)).toBe(
      "[maintainability] 1 violation(s) in pkgs/@demo/core:\n" +
        "  pkgs/@demo/core/server/host.ts:1  akan.size.function  function boot has 210 lines, over the 150-line limit, up from 200\n" +
        "How to fix:\n" +
        "  function: Split it by family into named functions or a collaborator class, each under the limit, keeping its signature for callers.",
    );
  });
});

describe("MaintainabilityContract bare errors", () => {
  const manifest = '{ "name": "akanjs" }\n';
  const akanjsOf = (root: string) => new MaintainabilityContract(root, { type: "pkg", name: "akanjs" });
  const failing = (count: number, prefix = "f") =>
    `${Array.from(
      { length: count },
      (_, idx) => `export const ${prefix}${idx} = () => {\n  throw new Error("${idx}");\n};`,
    ).join("\n")}\n`;
  const shapes = `import { AkanError } from "akanjs/base";
import { Err } from "akanjs/dictionary";
export const a = () => {
  throw new globalThis.Error("1");
};
export const b = () => {
  throw Object.assign(new Error("2"), { statusCode: 400 });
};
export const c = (err?: Error) => {
  throw err ?? Error("3");
};
export const d = (x: boolean) => {
  throw x ? new TypeError("4a") : new RangeError("4b");
};
export const e = () => {
  const failure = new Error("5");
  throw failure;
};
export const f = () => {
  throw (<Error>new Error("6"))!;
};
export const g = () => new Promise((_, reject) => reject(new Error("7") satisfies Error));
class LocalError extends Error {}
export const h = () => {
  throw new LocalError("9");
};
export const i = (Error: ErrorConstructor) => {
  throw new Error("shadowed by a parameter");
};
export const j = () => {
  const TypeError = class {};
  throw new TypeError();
};
export const k = (input: unknown) => {
  if (input === 1) throw new AkanError("coded", "coded", { statusCode: 400 });
  if (input === 2) throw new Err.NotFound("base.error.missing");
  if (input instanceof Error) Error.captureStackTrace(input);
  throw new DOMException("aborted", "AbortError");
};
`;
  const baselineAt = async (root: string) =>
    MaintainabilityBaseline.parse(
      await readFile(path.join(root, "pkgs/akanjs/akan.baseline.json"), "utf8"),
    ).sections.get("akan.error.bare-error");

  test("counts each built-in Error constructed, rejected or extended under server/, service/ and signal/ of akanjs", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/shapes.ts": shapes,
      "pkgs/akanjs/signal/fail.ts": failing(1),
      "pkgs/akanjs/service/run.test.ts": failing(2),
      "pkgs/akanjs/client/run.ts": failing(2),
      "pkgs/akanjs/service/imported.ts": `import { Error } from "./errors";\nexport const fail = () => new Error("x");\n`,
      "pkgs/framework/package.json": manifest,
      "pkgs/framework/server/fail.ts": failing(1),
      "pkgs/other/package.json": '{ "name": "other" }\n',
      "pkgs/other/server/fail.ts": failing(1),
    });

    expect(await akanjsOf(root).measure()).toEqual([
      {
        kind: "bareError",
        rule: "akan.error.bare-error",
        key: "server/shapes.ts",
        file: "server/shapes.ts",
        line: 4,
        lines: [4, 7, 10, 13, 13, 16, 20, 22, 23],
      },
      {
        kind: "bareError",
        rule: "akan.error.bare-error",
        key: "signal/fail.ts",
        file: "signal/fail.ts",
        line: 2,
        lines: [2],
      },
    ]);
    expect(await new MaintainabilityContract(root, { type: "pkg", name: "framework" }).measure()).toMatchObject([
      { rule: "akan.error.bare-error", key: "server/fail.ts" },
    ]);
    expect(await new MaintainabilityContract(root, { type: "pkg", name: "other" }).measure()).toEqual([]);
  });

  test("holds the package's total, so a rename or a split passes and the entries follow the code", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/host.ts": failing(3),
    });
    await akanjsOf(root).seed();
    await commitAll(root);
    await git(root, "checkout", "-q", "-b", "feat");

    await git(root, "mv", "pkgs/akanjs/server/host.ts", "pkgs/akanjs/server/moved.ts");
    expect(await akanjsOf(root).enforce({ fix: false })).toEqual([]);
    expect(await akanjsOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineAt(root)).toEqual(new Map([["server/moved.ts", 3]]));

    await writeText(path.join(root, "pkgs/akanjs/server/moved.ts"), failing(1));
    await writeText(path.join(root, "pkgs/akanjs/signal/extracted.ts"), failing(2, "g"));
    expect(await akanjsOf(root).enforce({ fix: false })).toEqual([]);
    expect(await akanjsOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineAt(root)).toEqual(
      new Map([
        ["server/moved.ts", 1],
        ["signal/extracted.ts", 2],
      ]),
    );

    await writeText(path.join(root, "pkgs/akanjs/signal/extracted.ts"), failing(1, "g"));
    expect(await akanjsOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineAt(root)).toEqual(
      new Map([
        ["server/moved.ts", 1],
        ["signal/extracted.ts", 1],
      ]),
    );
  });

  test("fails a new bare Error anywhere, naming the file whose count rose", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/host.ts": failing(3),
    });
    await akanjsOf(root).seed();
    await commitAll(root);
    await writeText(path.join(root, "pkgs/akanjs/service/fresh.ts"), failing(1));

    const contract = akanjsOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([{ rule: "akan.error.bare-error", key: "service/fresh.ts", lines: [2] }]);
    expect(contract.describe(failures)).toBe(
      "[maintainability] 1 violation(s) in pkgs/akanjs:\n" +
        "  pkgs/akanjs/service/fresh.ts:2  akan.error.bare-error  constructs or extends 1 bare Error, on line 2, and the package's total grew\n" +
        "How to fix:\n" +
        "  bare Error: Construct an `AkanError` subclass from `akanjs/base` with a code the caller can branch on, and a `statusCode` when it answers a request: an existing class whose code fits, or a new one beside the code that fails; a class extending a built-in Error extends `AkanError` instead. A failure another process reported travels as itself. The package's total is what is held, so moving a bare Error between files passes and `akan lint` rewrites the entries.",
    );

    await writeText(path.join(root, "pkgs/akanjs/server/host.ts"), failing(4));
    await Bun.write(path.join(root, "pkgs/akanjs/service/fresh.ts"), "export const fine = 1;\n");
    expect(await akanjsOf(root).enforce({ fix: false })).toMatchObject([
      { rule: "akan.error.bare-error", key: "server/host.ts", lines: [2, 5, 8, 11], recorded: 3 },
    ]);
  });

  test("refuses a working total raised over the fork point's, whatever file it is recorded under", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/host.ts": failing(2),
    });
    await akanjsOf(root).seed();
    await commitAll(root);
    await writeText(path.join(root, "pkgs/akanjs/server/host.ts"), failing(3));
    await akanjsOf(root).seed({ force: true });

    const contract = akanjsOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([
      { kind: "baselineGrowth", debtRule: "akan.error.bare-error", key: "(total)", count: 3, committed: 2, line: 2 },
    ]);
    expect(contract.describe(failures)).toMatch(
      /akan\.baseline\.json:2 {2}akan\.baseline\.growth {2}akan\.error\.bare-error allows 3 bare Errors in all, above the 2 at [0-9a-f]{12}; the baseline may only shrink/,
    );
  });

  test("refuses a paydown that keeps the baseline, so a later change cannot spend what it paid", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/a.ts": failing(3),
    });
    await akanjsOf(root).seed();
    await commitAll(root);
    await git(root, "checkout", "-q", "-b", "pr-1");
    await writeText(path.join(root, "pkgs/akanjs/server/a.ts"), failing(1));

    const contract = akanjsOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toEqual([
      {
        kind: "staleTotal",
        rule: "akan.error.bare-error",
        key: "(total)",
        file: "akan.baseline.json",
        line: 2,
        count: 1,
        recorded: 3,
      },
    ]);
    expect(contract.describe(failures)).toBe(
      "[maintainability] 1 violation(s) in pkgs/akanjs:\n" +
        "  pkgs/akanjs/akan.baseline.json:2  akan.error.bare-error  records 3 bare Errors in all, above the 1 the code holds\n" +
        "How to fix:\n" +
        "  baseline total: Run `akan verify <package>`, which lowers the section, and commit `akan.baseline.json` in this change: a recorded total above the code is room for a new failure anywhere. A bare `akan verify` covers only uncommitted files.",
    );

    expect(await akanjsOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineAt(root)).toEqual(new Map([["server/a.ts", 1]]));
    expect(await akanjsOf(root).enforce({ fix: false })).toEqual([]);

    await git(root, "add", "-A");
    await git(root, "commit", "-q", "-m", "pr 1");
    await git(root, "checkout", "-q", "main");
    await git(root, "merge", "-q", "--ff-only", "pr-1");
    await git(root, "checkout", "-q", "-b", "pr-2");
    await writeText(path.join(root, "pkgs/akanjs/signal/new.ts"), failing(2, "g"));

    expect(await akanjsOf(root).enforce({ fix: false })).toMatchObject([
      { rule: "akan.error.bare-error", key: "signal/new.ts", lines: [2, 5] },
    ]);
  });

  test("refuses a stale total in a scope with no reference to compare with", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/a.ts": failing(1),
      "pkgs/akanjs/akan.baseline.json": '{\n  "akan.error.bare-error": {\n    "server/a.ts": 3\n  }\n}\n',
    });

    expect(await akanjsOf(root).enforce({ fix: false })).toMatchObject([{ kind: "staleTotal", count: 1, recorded: 3 }]);
  });

  test("leaves the section untouched while over budget, so a move survives a run that also added one", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/a.ts": failing(3),
      "pkgs/akanjs/server/b.ts": failing(1),
    });
    await akanjsOf(root).seed();
    await commitAll(root);
    await git(root, "checkout", "-q", "-b", "feat");
    await writeText(path.join(root, "pkgs/akanjs/server/a.ts"), failing(2));
    await writeText(path.join(root, "pkgs/akanjs/server/b.ts"), failing(2));
    await writeText(path.join(root, "pkgs/akanjs/server/c.ts"), failing(1));

    expect(await akanjsOf(root).enforce({ fix: true })).toMatchObject([
      { key: "server/b.ts", recorded: 1 },
      { key: "server/c.ts" },
    ]);
    expect(await baselineAt(root)).toEqual(
      new Map([
        ["server/a.ts", 3],
        ["server/b.ts", 1],
      ]),
    );

    await rm(path.join(root, "pkgs/akanjs/server/c.ts"));
    expect(await akanjsOf(root).enforce({ fix: true })).toEqual([]);
    expect(await baselineAt(root)).toEqual(
      new Map([
        ["server/a.ts", 2],
        ["server/b.ts", 2],
      ]),
    );
    expect(await akanjsOf(root).enforce({ fix: false })).toEqual([]);
  });

  test("adopts the rule in a baseline that predates it with the fork point's total, and no more", async () => {
    const root = await makeWorkspace({
      "pkgs/akanjs/package.json": manifest,
      "pkgs/akanjs/server/host.ts": failing(2),
      "pkgs/akanjs/akan.baseline.json": '{\n  "akan.size.file": {\n    "server/big.ts": 900\n  }\n}\n',
      "pkgs/akanjs/server/big.ts": linesOf(900),
    });
    await commitAll(root);

    await akanjsOf(root).seed({ force: true });
    expect(await baselineAt(root)).toEqual(new Map([["server/host.ts", 2]]));
    expect(await akanjsOf(root).enforce({ fix: false })).toEqual([]);

    await writeText(path.join(root, "pkgs/akanjs/signal/fresh.ts"), failing(1));
    await akanjsOf(root).seed({ force: true });
    const contract = akanjsOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([
      {
        kind: "baselineGrowth",
        debtRule: "akan.error.bare-error",
        key: "(total)",
        count: 3,
        committed: 2,
        measured: true,
      },
    ]);
    expect(contract.describe(failures)).toMatch(
      /akan\.error\.bare-error allows 3 bare Errors in all, above the 2 the code at [0-9a-f]{12} holds with no entry for its rule recorded there/,
    );
  });
});

describe("MaintainabilityContract reference without a baseline", () => {
  const packageOf = (root: string) => new MaintainabilityContract(root, { type: "pkg", name: "@demo/core" });
  const functionOf = (name: string, lineNum: number) => `export function ${name}() {\n${linesOf(lineNum - 2)}\n}\n`;
  const host = "pkgs/@demo/core/server/host.ts";
  const writePackageBaseline = async (root: string, json: object) =>
    await writeText(path.join(root, "pkgs/@demo/core/akan.baseline.json"), `${JSON.stringify(json, null, 2)}\n`);

  test("refuses an entry for debt the fork point's code did not hold, unless a person gave it a reason", async () => {
    const root = await makeWorkspace({ [host]: functionOf("boot", 100) });
    await commitAll(root);
    await writeText(path.join(root, host), functionOf("boot", 200));
    await writePackageBaseline(root, { "akan.size.function": { "server/host.ts#boot": 200 } });

    const contract = packageOf(root);
    const failures = await contract.enforce({ fix: false });

    expect(failures).toMatchObject([
      { kind: "baselineGrowth", key: "server/host.ts#boot", count: 200, committed: undefined, measured: true, line: 3 },
    ]);
    expect(contract.describe(failures)).toMatch(
      /pkgs\/@demo\/core\/akan\.baseline\.json:3 {2}akan\.baseline\.growth {2}entry "server\/host\.ts#boot" under akan\.size\.function is debt the code at [0-9a-f]{12} does not hold/,
    );

    await writePackageBaseline(root, {
      "akan.size.function": { "server/host.ts#boot": 200 },
      reasons: { "server/host.ts#boot": "One state machine a person chose to keep whole." },
    });
    expect(await packageOf(root).enforce({ fix: false })).toEqual([]);
  });

  test("lets a scope adopt the gate with the debt its code held at the fork point, and no more", async () => {
    const root = await makeWorkspace({ [host]: functionOf("boot", 200) });
    await commitAll(root);

    expect((await packageOf(root).seed()).result).toBe("written");
    expect(await packageOf(root).enforce({ fix: false })).toEqual([]);

    await writeText(path.join(root, host), functionOf("boot", 210));
    await packageOf(root).seed({ force: true });

    expect(await packageOf(root).enforce({ fix: false })).toMatchObject([
      { kind: "baselineGrowth", key: "server/host.ts#boot", count: 210, committed: 200, measured: true },
    ]);
  });

  test("holds an app new to the branch, or one whose paid-off baseline was removed, to none", async () => {
    const zone = "apps/demo/lib/court/Court.Zone.tsx";
    const root = await makeWorkspace({ "apps/other/lib/court/Court.Zone.tsx": linesOf(10) });
    await commitAll(root);
    await writeText(path.join(root, zone), linesOf(450));
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 450 } });

    expect(await contractOf(root).enforce({ fix: false })).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.Zone.tsx", count: 450, committed: undefined, measured: true },
    ]);

    await writeText(path.join(root, zone), linesOf(400));
    await contractOf(root).enforce({ fix: true });
    expect(existsSync(path.join(root, "apps/demo/akan.baseline.json"))).toBe(false);
    await git(root, "add", "-A");
    await git(root, "commit", "-q", "-m", "paid off");
    await writeText(path.join(root, zone), linesOf(450));
    await writeBaseline(root, { "akan.size.file": { "lib/court/Court.Zone.tsx": 450 } });

    expect(await contractOf(root).enforce({ fix: false })).toMatchObject([
      { kind: "baselineGrowth", key: "lib/court/Court.Zone.tsx", committed: undefined, measured: true },
    ]);
  });
});
