import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ServerGraph, ServerGraphFile } from "./serverGraphFile";

//? Resolved, as the graph holds real paths: on Windows a missing `/repo/...` resolves onto the current drive.
const at = (relative: string) => path.resolve("/repo/apps/a", relative);

const graph: ServerGraph = {
  inputs: [at("page/_index.tsx"), at("lib/task.constant.ts"), at("ui/Card.tsx")],
  clientExports: { [at("ui/Card.tsx")]: ["Card", "CardBody"] },
};
const touches = (files: string[], exportsNow: string[] | null = ["CardBody", "Card"]) =>
  ServerGraphFile.touches(graph, files, () => exportsNow);

describe("ServerGraphFile.touches", () => {
  test("a file the server graph never read changes nothing it renders", async () => {
    expect(await touches([at("ui/OnlyClient.tsx")])).toBe(false);
  });

  test("a module the server renders counts", async () => {
    expect(await touches([at("lib/task.constant.ts")])).toBe(true);
  });

  test("a client module that keeps its export names does not count, in any order", async () => {
    expect(await touches([at("ui/Card.tsx")])).toBe(false);
  });

  test("a client module whose names changed, or that stopped being one, counts", async () => {
    expect(await touches([at("ui/Card.tsx")], ["Card"])).toBe(true);
    expect(await touches([at("ui/Card.tsx")], null)).toBe(true);
  });

  test("without a graph every save counts", async () => {
    expect(await ServerGraphFile.touches(null, [at("ui/OnlyClient.tsx")], () => null)).toBe(true);
  });

  test("a changed file the build just read for the first time counts: a failed import was waiting for it", async () => {
    const next: ServerGraph = { ...graph, inputs: [...graph.inputs, at("ui/card.ts")] };
    expect(await ServerGraphFile.touches(graph, [at("ui/card.ts")], () => null, next)).toBe(true);
    expect(await ServerGraphFile.touches(graph, [at("ui/card.ts")], () => null)).toBe(false);
  });

  test("a failed build keeps the last good graph and carries its files to the next build's check", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-server-graph-"));
    try {
      await ServerGraphFile.write(dir, graph);
      await ServerGraphFile.carry(dir, [at("page/_index.tsx")]);
      const kept = await ServerGraphFile.read(dir);
      expect(kept?.inputs).toEqual(graph.inputs);
      expect(kept?.carried).toEqual([at("page/_index.tsx")]);
      expect(await ServerGraphFile.touches(kept, [at("ui/Card.tsx")], () => ["Card", "CardBody"])).toBe(false);
      const changed = [at("ui/Card.tsx"), ...(kept?.carried ?? [])];
      expect(await ServerGraphFile.touches(kept, changed, () => ["Card", "CardBody"])).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("a graph written again inside one mtime tick is read afresh", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-server-graph-"));
    try {
      const file = path.join(dir, ServerGraphFile.fileName);
      const tick = new Date(Math.floor(Date.now() / 1000) * 1000);
      await ServerGraphFile.write(dir, graph);
      fs.utimesSync(file, tick, tick);
      await ServerGraphFile.read(dir);
      await ServerGraphFile.carry(dir, [at("page/_index.tsx")]);
      fs.utimesSync(file, tick, tick);
      expect((await ServerGraphFile.read(dir))?.carried).toEqual([at("page/_index.tsx")]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
