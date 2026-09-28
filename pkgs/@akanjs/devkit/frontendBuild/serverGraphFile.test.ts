import { describe, expect, test } from "bun:test";
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
});
