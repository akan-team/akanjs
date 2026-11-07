import { afterEach, describe, expect, test } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import { createTempPackage, writeJson, writeText } from "@akanjs/devkit/testHelpers";
import { AgentHook } from "./agentHook";

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const brokenPackage = async () => {
  const { root, workspace } = await createTempPackage("@sample/tool");
  roots.push(root);
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  const dir = path.join(root, "pkgs/@sample/tool");
  await writeJson(path.join(dir, "tsconfig.json"), {
    compilerOptions: { strict: true, noEmit: true, types: [], target: "esnext", module: "esnext" },
    include: ["index.ts"],
  });
  await writeText(path.join(dir, "index.ts"), 'export const port: number = "8282";\nexport const ok = 1\n');
  return { root, workspace, file: path.join(dir, "index.ts") };
};

describe("AgentHook", () => {
  test("replaces only its own entries in the Claude Code settings", () => {
    const user = { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] };
    const once = AgentHook.mergeSettings({ model: "opus", hooks: { PreToolUse: [user] } });
    const twice = AgentHook.mergeSettings(once);
    expect(twice).toEqual(once);
    expect(twice.model).toBe("opus");
    const hooks = twice.hooks as Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
    expect(hooks.PreToolUse[0]).toEqual(user);
    expect(hooks.PreToolUse[1].matcher).toBe("Edit|Write");
    expect(hooks.Stop[0].hooks[0].command).toBe('cd "$CLAUDE_PROJECT_DIR" && bun run --silent akan agent hook stop');
  });

  test("denies an edit to a generated file before it happens, and lets every other edit through", async () => {
    const { root, workspace } = await brokenPackage();
    const hook = new AgentHook(workspace);
    const denied = await hook.run("pre-edit", { tool_input: { file_path: `${root}/apps/demo/lib/cnst.ts` } });
    expect(denied.block).toBe(true);
    expect(JSON.parse(AgentHook.respond("pre-edit", denied) ?? "{}")).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" },
    });
    expect(
      (await hook.run("pre-edit", { tool_input: { file_path: `${root}/apps/demo/lib/user/user.constant.ts` } })).block,
    ).toBe(false);
    expect((await hook.run("pre-edit", { tool_input: { file_path: "/elsewhere/apps/demo/lib/cnst.ts" } })).block).toBe(
      false,
    );
  });

  test("matches a file reported through a symlink to the workspace", async () => {
    const { root, workspace } = await brokenPackage();
    const link = `${root}-link`;
    await symlink(root, link);
    roots.push(link);
    const denied = await new AgentHook(workspace).run("pre-edit", {
      tool_input: { file_path: `${link}/apps/demo/lib/cnst.ts` },
    });
    expect(denied.block).toBe(true);
    expect(denied.message).toStartWith("apps/demo/lib/cnst.ts is generated");
  });

  test("lints each edit, then verifies what the session edited once it tries to stop", async () => {
    const { root, workspace, file } = await brokenPackage();
    const hook = new AgentHook(workspace);

    const edited = await hook.run("post-edit", { session_id: "s1", tool_input: { file_path: file } });
    expect(edited.block).toBe(false);
    expect(await Bun.file(file).text()).toContain("export const ok = 1;");

    const stopped = await hook.run("stop", { session_id: "s1" });
    expect(stopped.block).toBe(true);
    expect(stopped.message).toContain("pkgs/@sample/tool/index.ts:1:14 TS2322");
    expect(JSON.parse(AgentHook.respond("stop", stopped) ?? "{}")).toMatchObject({ decision: "block" });

    const again = await hook.run("stop", { session_id: "s1", stop_hook_active: true });
    expect(again.block).toBe(false);
    expect(await Bun.file(path.join(root, ".akan/agent/edits-s1.txt")).exists()).toBe(false);
    expect((await hook.run("stop", { session_id: "s1" })).block).toBe(false);
  }, 120_000);
});
