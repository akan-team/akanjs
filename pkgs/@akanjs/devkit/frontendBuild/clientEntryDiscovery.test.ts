import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("GraphClientEntryDiscovery", () => {
  test("a walk an invalidation overtook answers its caller but leaves nothing stale for the next one", async () => {
    for (const yields of [0, 5, 10, 20, 40, 80]) {
      const dir = await mkdtemp(path.join(os.tmpdir(), "akan-discovery-"));
      dirs.push(dir);
      const file = (name: string) => path.join(dir, name);
      await Bun.write(file("S.tsx"), 'import "./A";\n');
      await Bun.write(file("A.tsx"), 'import "./B";\nimport "./D";\n');
      await Bun.write(file("B.tsx"), "export const b = 1;\n");
      await Bun.write(file("C.tsx"), '"use client";\nexport const C = () => null;\n');
      await Bun.write(file("D.tsx"), "export const d = 1;\n");
      const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, (async () => null) as never);
      expect(await discovery.discover([file("S.tsx")])).toEqual([]);

      await Bun.write(file("B.tsx"), 'import "./C";\nexport const b = 1;\n');
      await Bun.write(file("D.tsx"), "export const d = 2;\n");
      discovery.invalidate([file("D.tsx")]);
      const walk = discovery.discover([file("S.tsx")]);
      for (let tick = 0; tick < yields; tick++) await Promise.resolve();
      discovery.invalidate([file("B.tsx")]);
      await walk;
      expect(await discovery.discover([file("S.tsx")])).toEqual([file("C.tsx")]);
    }
  });
});
