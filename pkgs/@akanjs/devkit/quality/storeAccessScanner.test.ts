import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { SignalMutationIndex } from "./signalMutationIndex";
import { StoreAccessScanner } from "./storeAccessScanner";
import { WritingActionIndex } from "./writingActionIndex";

const sourceOf = (file: string, content: string) =>
  ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const storeFile = "apps/demo/lib/board/board.store.ts";
const signalFile = "apps/demo/lib/boardPin/boardPin.signal.ts";
const signal = sourceOf(
  signalFile,
  "export class BoardPinSlice extends slice(srv.boardPin, { guards: { root: Admin, cru: User } }, () => ({})) {}\n",
);
const index = new WritingActionIndex(
  new SignalMutationIndex([{ file: signalFile, absolutePath: "", content: "", sourceFile: signal }]),
  [
    {
      file: storeFile,
      sourceFile: sourceOf(
        storeFile,
        `import { fetch, sig } from "../useClient";
export class BoardStore extends store(sig.board, () => ({})) {
  async addPinOnCanvas(boardId: string) {
    await fetch.createBoardPin({ board: boardId });
  }
}
`,
      ),
    },
  ],
);

const measure = (content: string) =>
  new StoreAccessScanner(index).measure(sourceOf("apps/demo/lib/board/Board.Zone.tsx", content));

describe("StoreAccessScanner", () => {
  test("counts every read, action, selector, slice and agent hook a component reaches the store through", () => {
    const counts = measure(`"use client";
import { st as store } from "@apps/demo/client";

export const Canvas = () => {
  const board = store.use.board();
  const pins = store.slice.boardInSelf.use.boardList();
  const zoom = store.sel((state) => state.zoom);
  const latest = store.ref((state) => state.board);
  const move = store.tool("movePin").exec(() => store.do.setZoom(1));
  return <div onClick={() => void store.do.addPinOnCanvas(board.id)}>{pins.length}{zoom}{latest.current?.id}{String(move)}</div>;
};

export const Empty = () => null;
`);

    expect(counts).toEqual([
      { component: "Canvas", line: 4, accessCount: 7 },
      { component: "Empty", line: 13, accessCount: 0 },
    ]);
  });

  test("leaves out a generated form setter bound to its control, but not a writing action named like one", () => {
    const counts = measure(`"use client";
import { st } from "@apps/demo/client";

export const General = () => {
  const boardForm = st.use.boardForm();
  return (
    <form>
      <input value={boardForm.name} onChange={(e) => st.do.setNameOnBoard(e.target.value)} />
      <input onChange={st.do.addTagOnBoard} />
      <input onChange={(e) => st.do.writeOnBoard("meta.title", e.target.value)} />
      <button type="button" onClick={() => void st.do.addPinOnCanvas(boardForm.id)} />
    </form>
  );
};
`);

    expect(counts).toEqual([{ component: "General", line: 4, accessCount: 2 }]);
  });

  test("measures nothing in a file that does not import st", () => {
    expect(measure("export const Plain = () => st.use.board();\n")).toEqual([]);
  });
});
