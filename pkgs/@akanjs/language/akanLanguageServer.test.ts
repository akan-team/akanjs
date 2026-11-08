import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { AkanLanguageServer } from "./akanLanguageServer";
import { LspConnection, type LspMessage } from "./lspConnection";

const signal = "apps/demo/lib/memo/memo.signal.ts";
const page = "apps/demo/page/memo.tsx";
const files: Record<string, string> = {
  "apps/demo/lib/memo/memo.constant.ts": `import { via } from "akanjs/constant";
export class MemoInput extends via((field) => ({
  name: field(String),
})) {}
export class MemoObject extends via(MemoInput, (field) => ({})) {}
export class LightMemo extends via(MemoObject, ["name"] as const, (resolve) => ({})) {}
export class Memo extends via(MemoObject, LightMemo, (resolve) => ({})) {}
`,
  "apps/demo/lib/memo/memo.document.ts": `import { by, from, into } from "akanjs/document";
import * as cnst from "../cnst";
export class MemoFilter extends from(cnst.Memo, (filter) => ({ query: {}, sort: {} })) {}
export class Memo extends by(cnst.Memo) {}
export class MemoModel extends into(Memo, MemoFilter, cnst.memo, () => ({})) {}
`,
  "apps/demo/lib/memo/memo.service.ts": `import { serve } from "akanjs/service";
import * as db from "../db";
export class MemoService extends serve(db.memo, () => ({})) {}
`,
  [signal]: `import { slice } from "akanjs/signal";
import * as srv from "../srv";
export class MemoSlice extends slice(srv.memo, { guards: { root: Admin, get: Public } }, (init) => ({
  inPublic: init({ guards: [Public] }).exec(function () {}),
})) {}
`,
  "apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";
import { sig } from "../useClient";
export class MemoStore extends store(sig.memo, () => ({})) {}
`,
  [page]: `import { fetch } from "@apps/demo/client";
export default async function Page() {
  const { memoListInPublic } = await fetch.initMemoInPublic();
  return memoListInPublic;
}
`,
  "apps/demo/node_modules/pkg/memo.signal.ts": "export const ignored = 1;\n",
};

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "akan-lsp-")));
for (const [rel, text] of Object.entries(files)) {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
}
mkdirSync(path.join(root, "libs"), { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const uriOf = (rel: string) => pathToFileURL(path.join(root, rel)).href;

const positionOf = (text: string, needle: string) => {
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`${needle} is missing`);
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: (before.at(-1) ?? "").length };
};

const startServer = () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const received: LspMessage[] = [];
  const waiting = new Map<string, (message: LspMessage) => void>();
  const exits: number[] = [];
  new AkanLanguageServer({ ts, input: toServer, output: fromServer, exit: (code) => exits.push(code) });
  const client = new LspConnection(fromServer, toServer, (message) => {
    received.push(message);
    if (message.method === undefined) waiting.get(String(message.id))?.(message);
  });
  let lastId = 0;
  const call = (method: string, params: unknown) =>
    new Promise<LspMessage>((resolve) => {
      const id = `test-${++lastId}`;
      waiting.set(id, resolve);
      client.send({ jsonrpc: "2.0", id, method, params });
    });
  const at = (rel: string, needle: string, text = files[rel]) => ({
    textDocument: { uri: uriOf(rel) },
    position: positionOf(text, needle),
  });
  const linesOf = (message: LspMessage) =>
    (message.result as { uri: string; range: { start: { line: number } } }[]).map(
      ({ uri, range }) => `${path.relative(root, new URL(uri).pathname)}:${range.start.line + 1}`,
    );
  return { client, call, at, linesOf, received, exits, input: toServer };
};

const initialize = async (server: ReturnType<typeof startServer>, params: object = {}) => {
  await server.call("initialize", { rootUri: pathToFileURL(root).href, capabilities: {}, ...params });
  server.client.notify("initialized", {});
};

describe("AkanLanguageServer", () => {
  it("answers definition, references and hover from the workspace on disk", async () => {
    const server = startServer();
    await initialize(server);
    expect(server.linesOf(await server.call("textDocument/definition", server.at(page, "initMemoInPublic")))).toEqual([
      `${signal}:4`,
    ]);
    expect(server.linesOf(await server.call("textDocument/references", server.at(signal, "inPublic:")))).toEqual([
      `${page}:3`,
      `${page}:3`,
    ]);
    const hover = await server.call("textDocument/hover", server.at(page, "initMemoInPublic"));
    expect((hover.result as { contents: { kind: string; value: string } }).contents).toEqual({
      kind: "markdown",
      value: expect.stringContaining(`\`${signal}:4\``),
    });
    expect(server.received.some((message) => message.method === "window/logMessage")).toBe(true);
  });

  it("finds the workspace above a folder that has no apps or libs of its own", async () => {
    const server = startServer();
    await initialize(server, { rootUri: null, workspaceFolders: [{ uri: uriOf("apps/demo") }] });
    expect(server.linesOf(await server.call("textDocument/definition", server.at(page, "initMemoInPublic")))).toEqual([
      `${signal}:4`,
    ]);
  });

  it("answers from open buffers and returns to the disk once they close", async () => {
    const server = startServer();
    await initialize(server);
    const edited = files[signal].replace("inPublic:", "inFeed:");
    const pageText = `\n\n${files[page].replace("initMemoInPublic", "initMemoInFeed")}`;
    server.client.notify("textDocument/didOpen", {
      textDocument: { uri: uriOf(signal), languageId: "typescript", version: 1, text: files[signal] },
    });
    server.client.notify("textDocument/didChange", {
      textDocument: { uri: uriOf(signal), version: 2 },
      contentChanges: [{ text: edited }],
    });
    server.client.notify("textDocument/didOpen", {
      textDocument: { uri: uriOf(page), languageId: "typescriptreact", version: 1, text: pageText },
    });
    const feed = await server.call("textDocument/definition", server.at(page, "initMemoInFeed", pageText));
    expect(server.linesOf(feed)).toEqual([`${signal}:4`]);
    server.client.notify("textDocument/didClose", { textDocument: { uri: uriOf(signal) } });
    server.client.notify("textDocument/didClose", { textDocument: { uri: uriOf(page) } });
    const restored = await server.call("textDocument/definition", server.at(page, "initMemoInPublic"));
    expect(server.linesOf(restored)).toEqual([`${signal}:4`]);
  });

  it("reads positions in a buffer with CRLF line breaks", async () => {
    const server = startServer();
    await initialize(server);
    const crlf = `\r\n${files[page].replace(/\n/g, "\r\n")}`;
    server.client.notify("textDocument/didOpen", {
      textDocument: { uri: uriOf(page), languageId: "typescriptreact", version: 1, text: crlf },
    });
    const { line, character } = positionOf(files[page], "initMemoInPublic");
    const found = await server.call("textDocument/definition", {
      textDocument: { uri: uriOf(page) },
      position: { line: line + 1, character },
    });
    expect(server.linesOf(found)).toEqual([`${signal}:4`]);
  });

  it("registers a file watcher and rereads a watched file that changed on disk", async () => {
    const server = startServer();
    await initialize(server, { capabilities: { workspace: { didChangeWatchedFiles: { dynamicRegistration: true } } } });
    writeFileSync(path.join(root, signal), files[signal].replace("inPublic:", "inDrafts:"));
    try {
      server.client.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: uriOf(signal), type: 2 }] });
      const pageText = files[page].replace("initMemoInPublic", "initMemoInDrafts");
      server.client.notify("textDocument/didOpen", {
        textDocument: { uri: uriOf(page), languageId: "typescriptreact", version: 1, text: pageText },
      });
      const drafts = await server.call("textDocument/definition", server.at(page, "initMemoInDrafts", pageText));
      expect(server.linesOf(drafts)).toEqual([`${signal}:4`]);
      expect(server.received.find((message) => message.method === "client/registerCapability")?.params).toEqual({
        registrations: [expect.objectContaining({ method: "workspace/didChangeWatchedFiles" })],
      });
    } finally {
      writeFileSync(path.join(root, signal), files[signal]);
    }
  });

  it("refuses requests before initialize and unknown methods, and exits by the shutdown it saw", async () => {
    const server = startServer();
    const early = await server.call("textDocument/definition", server.at(page, "initMemoInPublic"));
    expect(early.error?.code).toBe(-32002);
    await initialize(server);
    expect((await server.call("textDocument/rename", {})).error?.code).toBe(-32601);
    expect((await server.call("shutdown", null)).result).toBeNull();
    server.client.notify("exit", null);
    const unclean = startServer();
    unclean.input.end();
    await Bun.sleep(0);
    expect([...server.exits, ...unclean.exits]).toEqual([0, 1]);
  });
});
