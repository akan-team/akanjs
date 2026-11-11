import { describe, expect, test } from "bun:test";
import ts from "typescript";
import type { SourceFileInfo } from "./qualityScanner";
import { SignalMutationIndex } from "./signalMutationIndex";
import { WritePlacementScanner } from "./writePlacementScanner";
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
      `export class CourtEndpoint extends endpoint(srv.court, ({ query, mutation }) => ({
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
  setPicked(courtId: string) {
    this.set({ picked: courtId });
  }
}
`,
    ),
  ],
);

const scan = (file: string, body: string) => {
  const content = `"use client";\nimport { fetch as api, st } from "@apps/demo/client";\n\n${body}\n`;
  return new WritePlacementScanner(index).scan(
    file,
    `apps/demo/${file}`,
    fileOf(`apps/demo/${file}`, content).sourceFile,
  );
};

describe("WritePlacementScanner", () => {
  test("names every server write a ui/ or webkit/ file sends, by call or by reference, under any import name", () => {
    expect(
      scan(
        "webkit/useSkip.tsx",
        "export const useSkip = (courtId: string) => ({\n  skip: () => st.do.skipNvrOnCourt(courtId),\n  bound: st.do.skipNvrOnCourt,\n  count: () => api.courtCount(),\n  direct: () => api.skipNvrOnCourt(courtId),\n});",
      ),
    ).toEqual({ line: 5, writes: ["st.do.skipNvrOnCourt", "st.do.skipNvrOnCourt", "api.skipNvrOnCourt"] });
  });

  test("lets a module component call a writing action, and a ui/ file set client state, but not a fetch mutation", () => {
    expect(
      scan("lib/court/Court.Zone.tsx", "export const Skip = ({ id }: { id: string }) => st.do.skipNvrOnCourt(id);"),
    ).toBeNull();
    expect(scan("ui/Pick.tsx", "export const Pick = ({ id }: { id: string }) => st.do.setPicked(id);")).toBeNull();
    expect(
      scan("lib/court/Court.Zone.tsx", "export const Skip = ({ id }: { id: string }) => api.skipNvrOnCourt(id);"),
    ).toEqual({ line: 4, writes: ["api.skipNvrOnCourt"] });
  });
});
