import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanCli } from "./akanCli";

const roots: string[] = [];
const workspaceOf = async (files: Record<string, string>) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-vscode-"));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), text);
  }
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("AkanCli", () => {
  test("runs the monorepo's akan script, else the installed @akanjs/cli bin, else nothing", async () => {
    const monorepo = await workspaceOf({ "package.json": JSON.stringify({ scripts: { akan: "bun cli.ts" } }) });
    expect(AkanCli.of(monorepo)?.command).toEqual(["bun", "run", "akan"]);

    const installed = await workspaceOf({
      "package.json": JSON.stringify({ scripts: { sync: "akan sync" } }),
      "node_modules/@akanjs/cli/package.json": JSON.stringify({ name: "@akanjs/cli", bin: { akan: "./index.js" } }),
    });
    expect(AkanCli.of(installed)?.command).toEqual([
      "bun",
      path.join(realpathSync(installed), "node_modules/@akanjs/cli/index.js"),
    ]);

    expect(AkanCli.of(await workspaceOf({ "package.json": "{}" }))).toBeNull();
    const outer = await workspaceOf({
      "node_modules/@akanjs/cli/package.json": JSON.stringify({ name: "@akanjs/cli", bin: { akan: "./index.js" } }),
      "nested/package.json": "{}",
    });
    expect(AkanCli.of(path.join(outer, "nested"))).toBeNull();
    expect(AkanCli.of(await workspaceOf({}))).toBeNull();
  });

  test("lists the apps and libraries that carry an akan.config.ts", async () => {
    const root = await workspaceOf({
      "apps/shop/akan.config.ts": "",
      "apps/notes/README.md": "",
      "libs/shared/akan.config.ts": "",
    });
    expect(AkanCli.systemsOf(root)).toEqual(["shop", "shared"]);
    expect(AkanCli.systemsOf(root, ["apps"])).toEqual(["shop"]);
  });

  test("reads the app and module a file sits in", () => {
    const root = path.join(tmpdir(), "ws");
    const placeOf = (relative: string) => AkanCli.placeOf(root, path.join(root, relative));
    expect(placeOf("apps/demo/lib/memo/memo.signal.ts")).toEqual({ system: "demo", module: "memo" });
    expect(placeOf("libs/shared/lib/_noti/noti.service.ts")).toEqual({ system: "shared", module: "_noti" });
    expect(placeOf("apps/demo/lib/cnst.ts")).toEqual({ system: "demo", module: null });
    expect(placeOf("apps/demo/page/memo.tsx")).toEqual({ system: "demo", module: null });
    expect(placeOf("pkgs/akanjs/index.ts")).toEqual({ system: null, module: null });
    expect(AkanCli.placeOf(root, path.join(tmpdir(), "elsewhere/apps/x/a.ts"))).toEqual({ system: null, module: null });
  });

  test("turns workflow inputs into kebab-case flags and drops the unset ones", () => {
    expect(
      AkanCli.argsOf({ app: "demo", field: "budget", includeInLight: true, surfaces: "", isDraft: false }),
    ).toEqual(["--app", "demo", "--field", "budget", "--include-in-light"]);
  });

  test("quotes a shell argument only when it needs it", () => {
    expect(AkanCli.shellArgOf("/ws/node_modules/@akanjs/cli/index.js")).toBe("/ws/node_modules/@akanjs/cli/index.js");
    expect(AkanCli.shellArgOf("/Users/me/My Work/cli.js")).toBe("'/Users/me/My Work/cli.js'");
    expect(AkanCli.shellArgOf("it's")).toBe("'it'\\''s'");
  });

  test("finds the JSON report after build and sync lines", () => {
    expect(AkanCli.jsonOf('$ bun build.ts\nFile Update: lib/sig.ts\n{"ok":true,"targets":["demo"]}\n')).toEqual({
      ok: true,
      targets: ["demo"],
    });
    expect(AkanCli.jsonOf('{ broken\n{\n  "workflow": "add-field"\n}\n')).toEqual({ workflow: "add-field" });
    expect(AkanCli.jsonOf("verify ok · demo\n")).toBeNull();
  });

  test("tells the CLI's failure line from a report, a failed verify report included", () => {
    const failure = AkanCli.jsonOf('\n{"ok":false,"error":"Unknown workflow: nope","code":"failed"}\n');
    expect(AkanCli.failureOf(failure)).toEqual({ error: "Unknown workflow: nope", code: "failed" });
    expect(AkanCli.failureOf({ ok: false, action: null, code: "notFound", error: "Unknown app", runId: null })).toEqual(
      { error: "Unknown app", code: "notFound" },
    );
    expect(AkanCli.failureOf({ ok: false, targets: ["demo"], steps: [], diagnostics: [] })).toBeNull();
    expect(AkanCli.failureOf({ status: "failed", diagnostics: [] })).toBeNull();
    expect(AkanCli.failureOf({ ok: false, error: "no code" })).toBeNull();
  });
});
