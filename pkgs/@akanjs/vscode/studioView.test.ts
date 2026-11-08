import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StudioView } from "./studioView";

describe("StudioView", () => {
  test("frames the Studio URL and lets only that origin's frame and a nonce script in", () => {
    const html = StudioView.htmlOf("http://localhost:8284/_akan/studio?view=signals&module=memo", "n0nce");
    expect(html).toContain(`<iframe src="http://localhost:8284/_akan/studio?view=signals&amp;module=memo"`);
    expect(html).toContain(
      "default-src 'none'; frame-src http://localhost:8284; style-src 'unsafe-inline'; script-src 'nonce-n0nce';",
    );
    expect(html).toContain('<script nonce="n0nce">');
    expect(html).toContain('event.origin === "http://localhost:8284" && event.source === frame.contentWindow');
  });

  test("names the module a lib folder holds, and none for scalars", () => {
    expect(StudioView.moduleOf("memo")).toBe("memo");
    expect(StudioView.moduleOf("_oauth")).toBe("oauth");
    expect(StudioView.moduleOf("__scalar")).toBeNull();
    expect(StudioView.moduleOf(null)).toBeNull();
  });

  test("opens a source the Studio asks for only when it sits in the workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "akan-studio-"));
    try {
      const fileName = path.join(root, "apps/demo/lib/memo/memo.service.ts");
      const open = (overrides: Record<string, unknown>) =>
        StudioView.sourceOf({ type: "akan-studio:open", path: fileName, line: 9, column: 3, ...overrides }, root);
      expect(open({})).toEqual({ fileName, line: 9, column: 3 });
      expect(open({ path: path.join(root, "../elsewhere.ts") })).toBeNull();
      expect(open({ path: `${root}/apps/../../elsewhere.ts` })).toBeNull();
      expect(open({ line: 0 })).toBeNull();
      expect(open({ column: "3" })).toBeNull();
      expect(open({ type: "akan-studio:ready" })).toBeNull();
      expect(StudioView.sourceOf(null, root)).toBeNull();
      expect(StudioView.isReady({ type: "akan-studio:ready", href: "http://localhost:8284/_akan/studio" })).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
