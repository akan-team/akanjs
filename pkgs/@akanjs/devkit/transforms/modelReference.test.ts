import { describe, expect, test } from "bun:test";
import path from "node:path";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { ModelReference } from "./modelReference";
import { RouteRuntime } from "./routeRuntime";

const makeTempRoot = tempDirs("akan-model-reference-");
const scopes = ["libs/kit", "apps/demo"];
const onDisk = (model: string) => `"use client";\n\nexport const reference = "${model}";\n`;
const piecesOf = (app: string[], kit: string[]) =>
  new Set([
    ...app.map((piece) => `apps/demo/lib/__client/${piece}`),
    ...kit.map((piece) => `libs/kit/lib/__client/${piece}`),
  ]);
const pieces = piecesOf(
  ["note.fetch", "note.st", "tag.fetch", "ping.fetch"],
  ["note.fetch", "note.st", "tag.fetch", "tag.st"],
);
const sourceOf = (model: string) =>
  ModelReference.sourceOf(onDisk(model), `apps/demo/lib/__client/${model}.ref.ts`, scopes, pieces);

describe("a model's reference file in the per-route build", () => {
  test("takes the app's descriptors and the app's store piece of a model the app extends, each as a binding its value uses", () => {
    expect(sourceOf("note")).toEqual({
      source: `"use client";

import * as descriptors from "@apps/demo/lib/__client/note.fetch";
import { note as store } from "@apps/demo/lib/__client/note.st";

export const reference = descriptors && store.refName;
`,
      pieces: ["apps/demo/lib/__client/note.fetch", "apps/demo/lib/__client/note.st"],
    });
  });

  test("takes the lib's store piece of a model the app does not extend, after the app's descriptors", () => {
    const tag = sourceOf("tag");

    expect(tag?.pieces).toEqual(["apps/demo/lib/__client/tag.fetch", "libs/kit/lib/__client/tag.st"]);
    expect(tag?.source).toContain('import { tag as store } from "@libs/kit/lib/__client/tag.st";');
    expect(tag?.source.indexOf("tag.fetch")).toBeLessThan(tag?.source.indexOf("tag.st") ?? -1);
  });

  test("names the model itself where the model has no store", () => {
    expect(sourceOf("ping")?.source).toBe(`"use client";

import * as descriptors from "@apps/demo/lib/__client/ping.fetch";

export const reference = descriptors && "ping";
`);
  });

  test("holds no import made only for its effect, which a split bundle would move away from it", () => {
    for (const model of ["note", "tag", "ping"]) expect(sourceOf(model)?.source).not.toMatch(/import\s*"/);
  });

  test("stays as written for a model with no piece, and is no reference file anywhere else", () => {
    expect(sourceOf("ghost")).toEqual({ source: onDisk("ghost"), pieces: [] });
    expect(ModelReference.sourceOf(onDisk("note"), "apps/demo/lib/__client/note.st.ts", scopes, pieces)).toBeNull();
    expect(ModelReference.sourceOf(onDisk("note"), "apps/demo/ui/note.ref.ts", scopes, pieces)).toBeNull();
  });

  test("is what the route build's transform answers for the file", async () => {
    const { demo } = await runtimeFixtureTables();
    const runtime = new RouteRuntime("/ws", demo, pieces);

    const routed = runtime.transform(onDisk("note"), "/ws/apps/demo/lib/__client/note.ref.ts");

    expect(routed).toEqual({ ...sourceOf("note"), perModule: true } as typeof routed);
  });
});

describe("the reference files of an app", () => {
  test("are listed by model from the app's own folder, and are none before a sync wrote them", async () => {
    const root = await makeTempRoot();
    const dir = path.join(root, "apps/demo/lib/__client");
    for (const file of ["note.ref.ts", "memo.ref.ts", "memo.st.ts", "refs.ts"]) await write(path.join(dir, file), "");
    await write(path.join(root, "libs/kit/lib/__client/tag.ref.ts"), "");

    expect([...(await ModelReference.filesOf(root, "apps/demo"))]).toEqual([
      ["memo", path.join(dir, "memo.ref.ts")],
      ["note", path.join(dir, "note.ref.ts")],
    ]);
    expect([...(await ModelReference.filesOf(root, "apps/other"))]).toEqual([]);
  });

  test("are registered by the file the root layout imports", () => {
    expect(ModelReference.registrySpecifier("demo")).toBe("@apps/demo/lib/__client/refs");
  });
});
