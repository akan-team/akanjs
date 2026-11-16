import ts from "typescript";
import { RuntimeModuleFacts, type RuntimeSourceFile } from "./runtimeModuleFacts";
import { RuntimeNameTable } from "./runtimeNameTable";

const kitFiles: Record<string, string> = {
  "libs/kit/lib/_util/util.store.ts": `import { store } from "akanjs/store";

export class UtilStore extends store("util" as const, () => ({ label: "" })) {
  pickLabel(label: string) {
    this.set({ label });
  }
}
`,
  "libs/kit/lib/note/note.constant.ts": `import { via } from "akanjs/constant";

export class NoteInput extends via((field) => ({ body: field(String) })) {}
export class NoteObject extends via(NoteInput, (field) => ({})) {}
export class LightNote extends via(NoteObject, ["body"] as const, (resolve) => ({})) {}
export class Note extends via(NoteObject, LightNote, (resolve) => ({})) {}
`,
  "libs/kit/lib/note/note.signal.ts": `import { endpoint, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class NoteSlice extends slice(srv.note, { guards: { root: Public, get: Public, cru: Public } }, (init) => ({
  inKit: init({ guards: [Public] }).exec(function () {
    return this.noteService.queryAny();
  }),
})) {}

export class NoteEndpoint extends endpoint(srv.note, ({ query }) => ({
  noteCount: query(Int, { guards: [Public] }).exec(() => 0),
})) {}
`,
  "libs/kit/lib/note/note.store.ts": `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class NoteStore extends store(sig.note, () => ({ noteCount: 0 })) {}
`,
  "libs/kit/lib/tag/tag.constant.ts": `import { via } from "akanjs/constant";

export class TagInput extends via((field) => ({ label: field(String) })) {}
export class TagObject extends via(TagInput, (field) => ({})) {}
export class LightTag extends via(TagObject, ["label"] as const, (resolve) => ({})) {}
export class Tag extends via(TagObject, LightTag, (resolve) => ({})) {}
`,
  "libs/kit/lib/tag/tag.signal.ts": `import { endpoint, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class TagSlice extends slice(srv.tag, { guards: { root: Public, get: Public, cru: Public } }, () => ({})) {}

export class TagEndpoint extends endpoint(srv.tag, ({ query }) => ({
  tagCount: query(Int, { guards: [Public] }).exec(() => 0),
})) {}
`,
  "libs/kit/lib/tag/tag.store.ts": `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class TagStore extends store(sig.tag, () => ({ tagFilter: "" })) {}
`,
};

const demoFiles: Record<string, string> = {
  "apps/demo/lib/memo/memo.constant.ts": `import { via } from "akanjs/constant";

export class MemoInput extends via((field) => ({ title: field(String), tags: field([String]) })) {}
export class MemoObject extends via(MemoInput, (field) => ({})) {}
export class LightMemo extends via(MemoObject, ["title"] as const, (resolve) => ({})) {}
export class Memo extends via(MemoObject, LightMemo, (resolve) => ({})) {}
`,
  "apps/demo/lib/memo/memo.signal.ts": `import { endpoint, Public, slice } from "akanjs/signal";

import * as srv from "../srv";

export class MemoSlice extends slice(srv.memo, { guards: { get: Public, cru: Public, remove: false } }, (init) => ({
  inBoard: init({ guards: [Public] }).live().exec(function () {
    return this.memoService.queryAny();
  }),
})) {}

export class MemoEndpoint extends endpoint(srv.memo, ({ query, message }) => ({
  memoNote: query(String, { guards: [Public] }).exec(() => ""),
  memoTyping: message(Boolean, { guards: [Public] }).exec(() => true),
})) {}
`,
  "apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class MemoStore extends store(
  sig.memo,
  () => ({ draft: "" }),
  (derive) => ({ draftLength: derive((state) => state.draft.length) }),
) {
  clearDraft() {
    this.set({ draft: "" });
  }
}
`,
  "apps/demo/lib/note/note.signal.ts": `import { endpoint, Public, slice } from "akanjs/signal";

import { note } from "../__lib/lib.signal";
import * as srv from "../srv";

export class NoteSlice extends slice(srv.note, { guards: { get: Public, cru: Public } }, () => ({}), ...note.slices) {}

export class NoteEndpoint extends endpoint(srv.note, () => ({}), ...note.endpoints) {}
`,
  "apps/demo/lib/note/note.store.ts": `import { store } from "akanjs/store";

import { note } from "../__lib/lib.store";
import { sig } from "../useClient";

export class NoteStore extends store(sig.note, () => ({ pinned: false }), ...note.stores) {}
`,
};

export const runtimeFixtureLayer = (scope: string, files: Record<string, string>) =>
  RuntimeModuleFacts.layerOf(
    scope,
    Object.entries(files).map(
      ([file, text]): RuntimeSourceFile => ({
        file,
        sourceFile: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      }),
    ),
  );

export const runtimeFixtureTables = async () => {
  const base = await RuntimeNameTable.readBase(import.meta.dir);
  const kitLayer = runtimeFixtureLayer("libs/kit", kitFiles);
  const kit = RuntimeNameTable.fromLayers([kitLayer], base);
  const demo = RuntimeNameTable.fromLayers([kitLayer, runtimeFixtureLayer("apps/demo", demoFiles)], base);
  return { kit, demo };
};
