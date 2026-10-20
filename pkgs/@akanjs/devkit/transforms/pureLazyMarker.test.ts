import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { PureLazyMarker } from "./pureLazyMarker";

const makeTempRoot = tempDirs("akan-pure-lazy-");

describe("PureLazyMarker", () => {
  test("marks each lazy() a declaration holds, and nothing else", () => {
    const source = [
      'import { lazy } from "akanjs/webkit";',
      'export const Globe = lazy(() => import("./Globe_Dynamic"), { ssr: false });',
      "const Editor: Component = lazy(() =>",
      '  import("./Editor"),',
      ");",
      'const sample = `const Chart = lazy(() => import("./Chart"));`;',
      'register(lazy(() => import("./Side")));',
    ].join("\n");
    expect(PureLazyMarker.mark(source, "ui.tsx")).toBe(
      [
        'import { lazy } from "akanjs/webkit";',
        'export const Globe = /* @__PURE__ */ lazy(() => import("./Globe_Dynamic"), { ssr: false });',
        "const Editor: Component = /* @__PURE__ */ lazy(() =>",
        '  import("./Editor"),',
        ");",
        'const sample = `const Chart = lazy(() => import("./Chart"));`;',
        'register(lazy(() => import("./Side")));',
      ].join("\n"),
    );
    const plain = "export const one = 1;";
    expect(PureLazyMarker.mark(plain, "plain.ts")).toBe(plain);
  });

  test("lets the bundler drop a barrel's lazy component that nothing renders, with what it imports", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "lazy.ts"), "export const lazy = (load: () => Promise<unknown>) => ({ load });\n");
    await writeText(path.join(root, "Heavy.ts"), 'export default "a heavy chunk";\n');
    await writeText(
      path.join(root, "ui.ts"),
      [
        'import { lazy } from "./lazy";',
        'export const Heavy = lazy(() => import("./Heavy"));',
        'export const Card = "a card";',
      ].join("\n"),
    );
    await writeText(path.join(root, "entry.ts"), 'import { Card } from "./ui";\nconsole.info(Card);\n');
    const result = await Bun.build({
      entrypoints: [path.join(root, "entry.ts")],
      plugins: [PureLazyMarker.plugin()],
      splitting: false,
    });
    const [output] = result.outputs;
    expect(result.success).toBe(true);
    const text = (await output?.text()) ?? "";
    expect(text).toContain("a card");
    expect(text).not.toContain("a heavy chunk");
  });
});
