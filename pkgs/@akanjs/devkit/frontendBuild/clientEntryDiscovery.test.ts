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

  const tempDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-discovery-"));
    dirs.push(dir);
    return (name: string) => path.join(dir, name);
  };

  test("an entry moved into a folder, or to another extension, is found once the move is invalidated", async () => {
    const file = await tempDir();
    await Bun.write(file("S.tsx"), 'import "./ui/Chart";\nimport "./ui/Card";\n');
    await Bun.write(file("ui/Chart.tsx"), '"use client";\nexport const Chart = () => null;\n');
    await Bun.write(file("ui/Card.tsx"), '"use client";\nexport const Card = () => null;\n');
    const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, (async () => null) as never);
    expect(await discovery.discover([file("S.tsx")])).toEqual([file("ui/Card.tsx"), file("ui/Chart.tsx")]);

    await rm(file("ui/Chart.tsx"));
    await Bun.write(file("ui/Chart/index.tsx"), '"use client";\nexport const Chart = () => null;\n');
    await rm(file("ui/Card.tsx"));
    await Bun.write(file("ui/Card.ts"), '"use client";\nexport const Card = () => null;\n');
    discovery.invalidate([file("ui/Chart.tsx"), file("ui/Chart/index.tsx"), file("ui/Card.tsx"), file("ui/Card.ts")]);
    expect(await discovery.discover([file("S.tsx")])).toEqual([file("ui/Card.ts"), file("ui/Chart/index.tsx")]);
  });

  test("a resolution still in flight when its target appears is not what the next walk reads", async () => {
    const file = await tempDir();
    await Bun.write(file("S.tsx"), 'import "./B";\n');
    await Bun.write(file("B.tsx"), 'import "@demo/C";\nexport const b = 1;\n');
    const gate = Promise.withResolvers<void>();
    const seen = Promise.withResolvers<void>();
    let calls = 0;
    const resolvePackage = async () => {
      calls += 1;
      const exists = await Bun.file(file("C.tsx")).exists();
      if (calls === 1) {
        seen.resolve();
        await gate.promise;
      }
      return exists ? { entryFile: file("C.tsx") } : null;
    };
    const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, resolvePackage as never);
    const walk = discovery.discover([file("S.tsx")]);
    await seen.promise;
    await Bun.write(file("C.tsx"), '"use client";\nexport const C = () => null;\n');
    discovery.invalidate([file("C.tsx")]);
    gate.resolve();
    await walk;
    expect(await discovery.discover([file("S.tsx")])).toEqual([file("C.tsx")]);
  });

  test("a dense import cycle is walked once per file, not once per path", async () => {
    const file = await tempDir();
    const names = Array.from({ length: 12 }, (_, idx) => `M${idx}.tsx`);
    for (const name of names)
      await Bun.write(file(name), names.map((other) => `import "./${other.replace(".tsx", "")}";\n`).join(""));
    await Bun.write(file("C.tsx"), '"use client";\nexport const C = () => null;\n');
    await Bun.write(
      file("M11.tsx"),
      `${names.map((other) => `import "./${other.replace(".tsx", "")}";\n`).join("")}import "./C";\n`,
    );
    const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, (async () => null) as never);
    const started = performance.now();
    expect(await discovery.discover([file("M0.tsx")])).toEqual([file("C.tsx")]);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(await discovery.discover([file("M5.tsx")])).toEqual([file("C.tsx")]);
  });

  test("a file walked inside an import cycle keeps no partial result for a walk that starts at it", async () => {
    const file = await tempDir();
    await Bun.write(file("A.tsx"), 'import "./B";\nimport "./C";\n');
    await Bun.write(file("B.tsx"), 'import "./A";\n');
    await Bun.write(file("C.tsx"), '"use client";\nexport const C = () => null;\n');
    const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, (async () => null) as never);
    expect(await discovery.discover([file("A.tsx")])).toEqual([file("C.tsx")]);
    expect(await discovery.discover([file("B.tsx")])).toEqual([file("C.tsx")]);
  });
});
