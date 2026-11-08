import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { akanCodePaths } from "@akanjs/devkit/codeAgent";

const dir = akanCodePaths.builtinSkillsDir() ?? "";
const names = readdirSync(dir).filter((entry) => !entry.startsWith("."));
const bodyOf = (name: string) => readFileSync(path.join(dir, name, "SKILL.md"), "utf8");
const frontmatterOf = (text: string) => text.split("---")[1] ?? "";

describe("akan skills", () => {
  test("the shipped set is discoverable from both the source tree and the bundle", () => {
    expect(dir).not.toBe("");
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  test.each(names)("%s declares the frontmatter the standard reads", (name) => {
    const front = frontmatterOf(bodyOf(name));
    // The folder name and the `name:` key must agree, or `/skill:<name>` resolves to nothing.
    expect(front).toContain(`name: ${name}`);
    const description = /description:\s*(.+)/.exec(front)?.[1]?.trim() ?? "";
    expect(description.length).toBeGreaterThan(40);
    expect(description.length).toBeLessThan(260);
  });

  test("every tool, workflow and guideline the skills name is one the runtime publishes", async () => {
    const { ContextRunner } = await import("../context/context.runner");
    const { Prompter } = await import("@akanjs/devkit/prompter");
    const runner = new ContextRunner();
    // `akan_verify` is registered by the akan pack rather than by the MCP catalogue.
    const tools = new Set([...runner.listMcpTools("apply").map((tool) => tool.name), "akan_verify"]);
    const guidelines = new Set(await Prompter.listGuidelines());
    const workflows = new Set([
      "create-module",
      "create-scalar",
      "create-ui",
      "add-field",
      "add-enum-field",
      "add-mutation",
      "add-slice",
      "rename-key",
    ]);
    const named = { tools: new Set<string>(), guidelines: new Set<string>(), workflows: new Set<string>() };
    for (const name of names) {
      const body = bodyOf(name);
      // A backticked snake_case identifier in these documents is always a tool name.
      for (const match of body.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)[`(]/g)) named.tools.add(match[1] ?? "");
      for (const match of body.matchAll(/`((?:create|add|rename)-[a-z-]+)`/g)) named.workflows.add(match[1] ?? "");
      // Only paragraphs offering a deeper read, so a prose identifier is not taken for a guideline name.
      for (const paragraph of body.split(/\n\s*\n/).filter((block) => block.includes("get_guideline")))
        for (const match of paragraph.matchAll(/`([a-zA-Z]+)`/g))
          if (match[1] !== "get_guideline") named.guidelines.add(match[1] ?? "");
    }
    expect(named.tools.size).toBeGreaterThan(5);
    expect([...named.tools].filter((name) => !tools.has(name))).toEqual([]);
    expect([...named.workflows].filter((name) => !workflows.has(name))).toEqual([]);
    expect(named.guidelines.size).toBeGreaterThan(5);
    expect([...named.guidelines].filter((name) => !guidelines.has(name))).toEqual([]);
  });

  test("every slash command the host offers is in the manual", async () => {
    const { CodeTuiCommands } = await import("./CodeTuiCommands");
    const manual = bodyOf("akan-code");
    expect(
      [...CodeTuiCommands.all].filter((command) => !manual.includes(`/${command.name}`)).map((c) => c.name),
    ).toEqual([]);
  });

  test("nothing carries over the pod paths or tool names of the system these were ported from", () => {
    for (const name of names) {
      const body = bodyOf(name);
      expect(body).not.toContain("akan_plan_workflow");
      expect(body).not.toContain("akan_apply_workflow");
      expect(body).not.toContain("akan_run_validation");
      expect(body).not.toContain("akan_list_modules");
      expect(body).not.toContain("/workspace/dev-");
    }
  });
});
