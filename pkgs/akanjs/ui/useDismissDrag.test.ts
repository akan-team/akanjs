import { describe, expect, test } from "bun:test";
import path from "node:path";

const importsOf = async (entry: string) => {
  const script = `
const built = await Bun.build({ entrypoints: [${JSON.stringify(path.join(import.meta.dir, entry))}], target: "browser", format: "esm", splitting: true, packages: "external", external: ["akanjs/*"] });
const outputs = await Promise.all(built.outputs.map(async (artifact) => ({ kind: artifact.kind, text: await artifact.text() })));
const specifiers = (text) => [...new Set([...text.matchAll(/(?:\\bfrom\\s*|\\bimport\\s*)["']([^"'./][^"']*)["']/g)].map((match) => match[1]))].sort();
console.log(JSON.stringify({ success: built.success, entry: specifiers(outputs.filter((output) => output.kind === "entry-point").map((output) => output.text).join("\\n")), chunks: specifiers(outputs.filter((output) => output.kind !== "entry-point").map((output) => output.text).join("\\n")) }));
`;
  const proc = Bun.spawn([process.execPath, "--eval", script], { cwd: import.meta.dir, stdout: "pipe" });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as {
    success: boolean;
    entry: string[];
    chunks: string[];
  };
};

describe("dismiss-drag loading", () => {
  test("a page using Dialog or Dialog.Modal loads neither react-spring nor use-gesture until they are needed", async () => {
    const dialog = await importsOf("Dialog/index.tsx");
    expect(dialog.success).toBe(true);
    expect(dialog.entry).not.toContain("@react-spring/web");
    expect(dialog.entry).not.toContain("@use-gesture/react");
    expect(dialog.chunks).toEqual(expect.arrayContaining(["@react-spring/web", "@use-gesture/react"]));
  });

  test("a bottom sheet keeps its spring but loads use-gesture only once it is pressed", async () => {
    const sheet = await importsOf("BottomSheet.tsx");
    expect(sheet.success).toBe(true);
    expect(sheet.entry).toContain("@react-spring/web");
    expect(sheet.entry).not.toContain("@use-gesture/react");
    expect(sheet.chunks).toContain("@use-gesture/react");
  });
});
