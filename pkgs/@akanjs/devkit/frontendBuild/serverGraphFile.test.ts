import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ServerGraph, ServerGraphFile } from "./serverGraphFile";

const graph: ServerGraph = {
  inputs: ["/repo/apps/a/page/_index.tsx", "/repo/apps/a/lib/task.constant.ts", "/repo/apps/a/ui/Card.tsx"],
  clientExports: { "/repo/apps/a/ui/Card.tsx": ["Card", "CardBody"] },
};
const touches = (files: string[], exportsNow: string[] | null = ["CardBody", "Card"]) =>
  ServerGraphFile.touches(graph, files, () => exportsNow);

describe("ServerGraphFile.touches", () => {
  test("a file the server graph never read changes nothing it renders", async () => {
    expect(await touches(["/repo/apps/a/ui/OnlyClient.tsx"])).toBe(false);
  });

  test("a module the server renders counts", async () => {
    expect(await touches(["/repo/apps/a/lib/task.constant.ts"])).toBe(true);
  });

  test("a client module that keeps its export names does not count, in any order", async () => {
    expect(await touches(["/repo/apps/a/ui/Card.tsx"])).toBe(false);
  });

  test("a client module whose names changed, or that stopped being one, counts", async () => {
    expect(await touches(["/repo/apps/a/ui/Card.tsx"], ["Card"])).toBe(true);
    expect(await touches(["/repo/apps/a/ui/Card.tsx"], null)).toBe(true);
  });

  test("without a graph every save counts", async () => {
    expect(await ServerGraphFile.touches(null, ["/repo/apps/a/ui/OnlyClient.tsx"], () => null)).toBe(true);
  });

  test("a changed file the build just read for the first time counts: a failed import was waiting for it", async () => {
    const next: ServerGraph = { ...graph, inputs: [...graph.inputs, "/repo/apps/a/ui/card.ts"] };
    expect(await ServerGraphFile.touches(graph, ["/repo/apps/a/ui/card.ts"], () => null, next)).toBe(true);
    expect(await ServerGraphFile.touches(graph, ["/repo/apps/a/ui/card.ts"], () => null)).toBe(false);
  });

  test("a failed build clears the graph, so the next save counts until one succeeds", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-server-graph-"));
    try {
      await ServerGraphFile.write(dir, graph);
      expect((await ServerGraphFile.read(dir))?.inputs).toEqual(graph.inputs);
      await ServerGraphFile.clear(dir);
      expect(await ServerGraphFile.read(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
