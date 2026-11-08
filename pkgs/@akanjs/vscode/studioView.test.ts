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

  test("runs only an allowlisted workflow the Studio asks for, with identifier targets and nothing else", () => {
    const ask = (overrides: Record<string, unknown>) =>
      StudioView.workflowOf({
        type: "akan-studio:workflow",
        workflow: "rename-key",
        inputs: { app: "demo", module: "memo", slice: "inPublic" },
        ...overrides,
      });
    expect(ask({})).toEqual({ workflow: "rename-key", inputs: { app: "demo", module: "memo", slice: "inPublic" } });
    expect(ask({ workflow: "create-module", inputs: { app: "leading-flight" } })).toEqual({
      workflow: "create-module",
      inputs: { app: "leading-flight" },
    });
    expect(ask({ workflow: "delete-module" })).toBeNull();
    expect(ask({ inputs: { app: "demo", module: "memo", to: "inAll" } })).toBeNull();
    expect(ask({ inputs: { app: "demo", module: "--force" } })).toBeNull();
    expect(ask({ inputs: { app: "demo", module: "memo; rm -rf ~" } })).toBeNull();
    expect(ask({ inputs: { module: "memo" } })).toBeNull();
    expect(ask({ inputs: { app: "demo", module: 3 } })).toBeNull();
    expect(ask({ type: "akan-studio:open" })).toBeNull();
  });

  test("asks for every input Studio did not preset, but no other target once Studio named one", () => {
    const target = { app: { required: true }, module: { required: true } };
    const asked = (specs: Record<string, { required?: boolean }>, given: Record<string, string>) =>
      StudioView.inputsToAsk(specs, given).map(([name]) => name);
    expect(asked(target, { app: "demo" })).toEqual(["module"]);
    expect(asked({ ...target, slice: { required: true } }, { app: "demo", module: "memo" })).toEqual(["slice"]);
    expect(
      asked(
        { ...target, slice: {}, query: {}, to: { required: true } },
        { app: "demo", module: "memo", slice: "inPublic" },
      ),
    ).toEqual(["to"]);
    expect(asked({ ...target, field: { required: true }, default: {} }, { app: "demo", module: "memo" })).toEqual([
      "field",
      "default",
    ]);
    expect(asked({ ...target, slice: {}, query: {} }, {})).toEqual(["app", "module", "slice", "query"]);
  });

  test("follows the Studio page the panel navigated to, on the dev server's own origin", () => {
    const loaded = "http://localhost:8284/_akan/studio?view=erd&editor=vscode";
    const follow = (href: unknown) =>
      StudioView.followed({ type: "akan-studio:ready", href }, loaded, "https://8284-forwarded.example");
    expect(follow("https://8284-forwarded.example/_akan/studio?view=changes&since=main")).toBe(
      "http://localhost:8284/_akan/studio?view=changes&since=main",
    );
    expect(follow("https://elsewhere.example/_akan/studio?view=changes")).toBeNull();
    expect(follow("https://8284-forwarded.example/admin")).toBeNull();
    expect(follow("not a url")).toBeNull();
    expect(follow(undefined)).toBeNull();
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
