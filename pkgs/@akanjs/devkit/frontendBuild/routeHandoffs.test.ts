import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { RouteRuntime } from "../transforms/routeRuntime";
import { RouteHandoffs } from "./routeHandoffs";

const makeTempRoot = tempDirs("akan-route-handoffs-");
const models = ["memo", "note", "tag"];
const client = 'import { fetch } from "@apps/demo/client";\n';

let root = "";
let handoffs: RouteHandoffs;
const file = (name: string) => path.join(root, name);
const referenceOf = (model: string) => file(`apps/demo/lib/__client/${model}.ref.ts`);
const readOf = async (sources: Record<string, string>) => {
  for (const [name, source] of Object.entries(sources)) await write(file(name), source);
  return handoffs.read(Object.keys(sources).map(file));
};

beforeAll(async () => {
  root = await makeTempRoot();
  const { demo } = await runtimeFixtureTables();
  const runtime = new RouteRuntime(root, demo, new Set());
  handoffs = new RouteHandoffs(root, runtime, new Map(models.map((model) => [model, referenceOf(model)])));
});

describe("the models a route's server modules hand to client components", () => {
  test("are those whose init, view, edit or slice a server module names, whichever module of the route names it", async () => {
    const read = await readOf({
      "apps/demo/page/board.tsx": `${client}export const Board = () => fetch.initMemoInBoard();\n`,
      "apps/demo/ui/NoteCard.tsx": `${client}export const card = (id: string) => fetch.viewNote(id);\n`,
      "apps/demo/ui/plain.ts": "export const plain = 1;\n",
    });

    expect(read).toEqual({ referenceFiles: [referenceOf("memo"), referenceOf("note")], unread: null });
  });

  test("include a model whose slice is read from `fetch.slice`", async () => {
    const read = await readOf({
      "apps/demo/page/tags.tsx": `${client}export const Tags = () => [fetch.slice.tag, fetch.tagCount()];\n`,
    });

    expect(read.referenceFiles).toEqual([referenceOf("tag")]);
  });

  test("leave out a model whose endpoint is only called, since a plain result brings no component a store to read", async () => {
    const read = await readOf({
      "apps/demo/page/count.tsx": `${client}export const Count = async () => [await fetch.memoNote(), await fetch.tagCount()];\n`,
    });

    expect(read).toEqual({ referenceFiles: [], unread: null });
  });

  test("are every model once a server module picks the name at run time, and say which file and line", async () => {
    const read = await readOf({
      "apps/demo/page/board.tsx": `${client}export const Board = () => fetch.initMemoInBoard();\n`,
      "apps/demo/page/any.tsx": `${client}\nexport const Any = (name: string) => (fetch as never)[name];\n`,
    });

    expect(read.referenceFiles).toEqual(models.map(referenceOf));
    expect(read.unread?.file).toBe("apps/demo/page/any.tsx");
    expect(read.unread?.why).toStartWith("line 3: ");
  });

  test("are every model once a server module takes `fetch` from the server barrel, where its names are not read", async () => {
    const read = await readOf({
      "apps/demo/page/served.tsx":
        'import { Memo } from "@apps/demo/client";\nimport { fetch } from "@apps/demo/server";\nexport const Served = (id: string) => [Memo, fetch.viewMemo(id)];\n',
    });

    expect(read.referenceFiles).toEqual(models.map(referenceOf));
    expect(read.unread).toEqual({
      file: "apps/demo/page/served.tsx",
      why: "line 2: `fetch` comes from the server barrel, where the names read from it are not checked; take it from the client barrel",
    });
  });

  test("do not count the server barrel's `fetch` where the file hands nothing over, nor a generated file", async () => {
    const read = await readOf({
      "apps/demo/page/ping.tsx":
        'import { fetch } from "@apps/demo/server";\nexport const ping = () => fetch.memoNote();\n',
      "apps/demo/page/typed.tsx":
        'import type { fetch } from "@apps/demo/server";\nexport type View = ReturnType<typeof fetch.viewMemo>;\n',
      "apps/demo/server.ts": 'import { fetch } from "./lib/useServer";\nexport const view = fetch.viewMemo;\n',
      "apps/demo/lib/useServer.ts": 'import { fetch } from "./sig";\nexport const view = fetch.viewMemo;\n',
    });

    expect(read).toEqual({ referenceFiles: [], unread: null });
  });

  test("name only models with a reference file, so a model the app's sync wrote none for adds nothing", async () => {
    const { demo } = await runtimeFixtureTables();
    const only = new RouteHandoffs(
      root,
      new RouteRuntime(root, demo, new Set()),
      new Map([["memo", referenceOf("memo")]]),
    );
    await write(
      file("apps/demo/page/both.tsx"),
      `${client}export const both = [fetch.initMemoInBoard(), fetch.viewNote("1")];\n`,
    );

    expect(await only.read([file("apps/demo/page/both.tsx")])).toEqual({
      referenceFiles: [referenceOf("memo")],
      unread: null,
    });
  });
});
