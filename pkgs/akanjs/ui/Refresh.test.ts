import { describe, expect, test } from "bun:test";
import path from "node:path";

describe("Refresh", () => {
  test("bundles its optional pull-to-refresh peer instead of leaving a bare browser import", async () => {
    const built = await Bun.build({
      entrypoints: [path.join(import.meta.dir, "Refresh.tsx")],
      target: "browser",
      format: "esm",
      splitting: true,
      external: ["react", "react/*", "react-dom", "react-dom/*", "react-icons/*", "akanjs/*"],
    });
    const outputs = await Promise.all(built.outputs.map((output) => output.text()));

    expect(built.success).toBe(true);
    expect(outputs.some((text) => /import\(\s*["']react-simple-pull-to-refresh["']\s*\)/.test(text))).toBe(false);
    expect(outputs.some((text) => text.includes("ptr__pull-down"))).toBe(true);
  });
});
