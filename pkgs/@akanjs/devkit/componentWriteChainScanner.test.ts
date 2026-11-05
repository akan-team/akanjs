import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { ComponentWriteChainScanner } from "./componentWriteChainScanner";
import type { SourceFileInfo } from "./qualityScanner";
import { SignalMutationIndex } from "./signalMutationIndex";
import { WritingActionIndex } from "./writingActionIndex";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/repo/${file}`,
  content,
  sourceFile: ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ),
});

const index = new WritingActionIndex(
  new SignalMutationIndex([
    fileOf(
      "apps/demo/lib/court/court.signal.ts",
      `export class CourtSlice extends slice(srv.court, { guards: { root: Admin, cru: User } }, () => ({})) {}
export class CourtEndpoint extends endpoint(srv.court, ({ query, mutation }) => ({
  skipNvrOnCourt: mutation(cnst.Court, { guards: [User] }).param("courtId", ID).exec(() => null),
  courtCount: query(Int, { guards: [User] }).exec(() => 0),
})) {}
`,
    ),
  ]),
  [
    fileOf(
      "apps/demo/lib/court/court.store.ts",
      `import { fetch, sig } from "../useClient";
export class CourtStore extends store(sig.court, () => ({})) {
  async skipNvrOnCourt(courtId: string) {
    this.setCourt(await fetch.skipNvrOnCourt(courtId));
  }
  async loadCourtCount() {
    this.set({ count: await fetch.courtCount() });
  }
}
`,
    ),
  ],
);

const chainsIn = (body: string) =>
  new ComponentWriteChainScanner(index).scan(
    fileOf(
      "apps/demo/lib/court/Court.Zone.tsx",
      `"use client";\nimport { st } from "@apps/demo/client";\n\nexport const Install = ({ courtId }: { courtId: string }) => {\n${body}\n};\n`,
    ).sourceFile,
  );

describe("ComponentWriteChainScanner", () => {
  test("reports one handler sending two writing actions at the second", () => {
    const chains = chainsIn(`  const register = st
    .tool("registerNvr")
    .exec(async () => {
      await st.do.updateCourt(courtId, {});
      await st.do.loadCourtCount();
      await st.do.skipNvrOnCourt(courtId);
    });
  return <button type="button" onClick={() => void register()} />;`);

    expect(chains).toEqual([
      { component: "Install", line: 10, writes: ["st.do.updateCourt", "st.do.skipNvrOnCourt"], writeCount: 2 },
    ]);
  });

  test("passes two writes in two separate handlers, a render callback included", () => {
    const chains = chainsIn(`  const courtIds = [courtId];
  return (
    <div>
      {courtIds.map((id) => (
        <div key={id}>
          <button type="button" onClick={() => void st.do.removeCourt(id)} />
          <button type="button" onClick={() => void st.do.skipNvrOnCourt(id)} />
        </div>
      ))}
    </div>
  );`);

    expect(chains).toEqual([]);
  });

  test("reads exclusive branches as one and an array or promise callback as part of its handler", () => {
    const chains = chainsIn(`  const onSave = async (isNew: boolean) => {
    if (isNew) await st.do.createCourt({});
    else await st.do.updateCourt(courtId, {});
  };
  const onRemoveAll = async (ids: string[]) => {
    await Promise.all(ids.map((id) => st.do.removeCourt(id)));
    await st.do.submitCourt().then(() => st.do.mergeCourt(courtId, {}));
  };
  return <button type="button" onClick={() => void onSave(true)} />;`);

    expect(chains).toEqual([
      {
        component: "Install",
        line: 11,
        writes: ["st.do.removeCourt (per item)", "st.do.submitCourt", "st.do.mergeCourt"],
        writeCount: 4,
      },
    ]);
  });

  test("reads one write per item as a chain, in a loop or a per-element callback, and a hook like a component", () => {
    const loop = chainsIn(`  const onRemoveAll = async (ids: string[]) => {
    for (const id of ids) await st.do.removeCourt(id);
  };
  return <button type="button" onClick={() => void onRemoveAll([courtId])} />;`);
    const hook = new ComponentWriteChainScanner(index).scan(
      fileOf(
        "apps/demo/webkit/useBulk.tsx",
        'import { st } from "@apps/demo/client";\n\nexport const useBulk = () => ({\n  run: async (ids: string[]) => {\n    await Promise.all(ids.map((id) => st.do.removeCourt(id)));\n  },\n});\n',
      ).sourceFile,
    );

    expect(loop).toEqual([{ component: "Install", line: 6, writes: ["st.do.removeCourt (per item)"], writeCount: 2 }]);
    expect(hook).toEqual([{ component: "useBulk", line: 5, writes: ["st.do.removeCourt (per item)"], writeCount: 2 }]);
  });

  test("ignores a component file that does not import st", () => {
    const chains = new ComponentWriteChainScanner(index).scan(
      fileOf(
        "apps/demo/ui/Plain.tsx",
        "export const Plain = () => {\n  const onClick = async () => {\n    await st.do.createCourt({});\n    await st.do.removeCourt('a');\n  };\n  return null;\n};\n",
      ).sourceFile,
    );

    expect(chains).toEqual([]);
  });
});
