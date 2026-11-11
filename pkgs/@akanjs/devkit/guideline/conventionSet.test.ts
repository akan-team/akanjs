import { describe, expect, test } from "bun:test";
import fsPromise from "node:fs/promises";
import path from "node:path";
import { MaintainabilityContract } from "../quality/maintainabilityContract";
import { MaintainabilityLimits } from "../quality/maintainabilityLimits";
import { ConventionSet } from "./conventionSet";
import { Prompter } from "./prompter";

describe("ConventionSet", () => {
  test("expands every brace list, so a comma-separated glob field can carry it", () => {
    expect(ConventionSet.expand("{apps,libs}/**/*.{ts,tsx}")).toEqual([
      "apps/**/*.ts",
      "apps/**/*.tsx",
      "libs/**/*.ts",
      "libs/**/*.tsx",
    ]);
    expect(ConventionSet.expand("**/.env*")).toEqual(["**/.env*"]);
  });

  test("reads a rule's description and paths from its frontmatter, and refuses one without", () => {
    const rule = ConventionSet.parseRule(
      "page",
      '---\ndescription: Route files.\npaths:\n  - "{apps,libs}/**/page/**"\n---\n\n# Pages\n',
    );
    expect(rule).toEqual({
      name: "page",
      description: "Route files.",
      paths: ["{apps,libs}/**/page/**"],
      body: "# Pages",
    });
    expect(() => ConventionSet.parseRule("bare", "# Pages\n")).toThrow("no frontmatter");
    expect(() => ConventionSet.parseRule("empty", "---\ndescription: x\n---\n")).toThrow("description and paths");
  });

  test("nests each rule under the core when composed, leaving fenced code alone", () => {
    const set = new ConventionSet("## Core", [
      { name: "a", description: "d", paths: ["x"], body: "# A\n\n## Part\n\n```sh\n# a comment\n```" },
    ]);
    expect(set.instruction).toBe("## Core\n\n## A\n\n### Part\n\n```sh\n# a comment\n```\n");
  });

  test("the shipped conventions guideline is the core followed by every rule", async () => {
    const set = await Prompter.getConventionSet();
    const instruction = await Prompter.getInstruction("conventions");
    expect(set.rules.length).toBeGreaterThanOrEqual(10);
    expect(instruction.startsWith(set.core)).toBe(true);
    for (const rule of set.rules) {
      expect(rule.body).toStartWith("# ");
      expect(instruction).toContain(`\n#${rule.body.split("\n")[0]}\n`);
    }
  });

  test("names only checks that exist, and names every lint plugin and maintainability gate a workspace runs", async () => {
    const set = await Prompter.getConventionSet();
    const named = new Set(
      [set.core, ...set.rules.map((rule) => rule.body)].flatMap((text) =>
        [...text.matchAll(/`([^`\s]+)`/g)].map((match) => match[1] ?? ""),
      ),
    );
    const plugins = (await fsPromise.readdir(path.join(import.meta.dir, "../lint")))
      .filter((file) => file.endsWith(".grit"))
      .map((file) => file.slice(0, -".grit".length));
    const gates: readonly string[] = MaintainabilityContract.ruleIds.filter(
      (id) => !MaintainabilityLimits.repoOnlyRules.has(id),
    );
    const gateAreas = new Set(gates.map((id) => id.split(".").slice(0, 2).join(".")));
    const isPluginName = (name: string) => /^non?-[a-z]+(-[a-z]+)+$/.test(name);
    const isGateName = (name: string) =>
      gateAreas.has(name.split(".").slice(0, 2).join(".")) && !name.endsWith(".json");

    expect([...named].filter((name) => isPluginName(name) && !plugins.includes(name))).toEqual([]);
    expect([...named].filter((name) => isGateName(name) && !gates.includes(name))).toEqual([]);
    expect(plugins.filter((plugin) => !named.has(plugin))).toEqual([]);
    expect(gates.filter((gate) => !named.has(gate))).toEqual([]);
  });
});
