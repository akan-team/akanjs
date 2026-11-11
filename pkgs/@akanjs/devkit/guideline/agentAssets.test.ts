import { describe, expect, test } from "bun:test";
import fsPromise from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentAssets } from "./agentAssets";

describe("AgentAssets", () => {
  test("packs whole H2 sections into parts under the limit, never splitting at a fenced heading", () => {
    const section = (name: string, size: number) => `## ${name}\n${"x".repeat(size)}`;
    const fenced = "## C\n```md\n## not a heading\n```";
    const parts = AgentAssets.split(
      ["# Title", section("A", 20_000), section("B", 7_000), fenced, section("D", 10_000)].join("\n"),
    );
    expect(parts.map((part) => part.headings)).toEqual([["A", "B", "C"], ["D"]]);
    expect(parts.every((part) => part.text.length <= AgentAssets.referenceLimit)).toBe(true);
    expect(parts[0]?.text).toStartWith("# Title\n## A");
  });

  test("ships the public skills under both roots with their guidelines once, inside every size budget", async () => {
    const assets = await AgentAssets.skills();
    const names = Object.keys(AgentAssets.skillReferences);
    const skills = assets.filter((asset) => asset.path.endsWith("/SKILL.md"));
    expect(names.length).toBeLessThanOrEqual(16);
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(skills.map((asset) => asset.path).sort(byName)).toEqual(
      AgentAssets.skillRoots.flatMap((root) => names.map((name) => `${root}/${name}/SKILL.md`)).sort(byName),
    );
    expect(assets.some((asset) => asset.path.includes("akan-code"))).toBe(false);

    const descriptions = skills
      .filter((asset) => asset.path.startsWith(".agents/"))
      .map((asset) => {
        const described: RegExpExecArray | null = /description:\s*"?(.+?)"?\n/.exec(asset.content);
        return described?.[1] ?? "";
      });
    expect(descriptions.join("").length).toBeLessThanOrEqual(4_000);
    for (const skill of skills)
      expect([skill.path, skill.content.split("\n").length <= 500]).toEqual([skill.path, true]);

    const references = assets.filter((asset) => asset.path.includes("/references/"));
    expect(references.every((asset) => asset.path.startsWith(".agents/skills/"))).toBe(true);
    for (const reference of references) {
      expect(reference.content.length).toBeLessThanOrEqual(AgentAssets.referenceLimit + 100);
      expect(skills.find((skill) => skill.content.includes(`\`${reference.path}\``))).toBeDefined();
    }
    expect(references.filter((asset) => asset.path.includes("/agentRule")).length).toBeGreaterThan(1);
  });

  test("names no rule or skill file that a new workspace's .gitignore would keep out of git", async () => {
    const assets = [...(await AgentAssets.rules()), ...(await AgentAssets.skills())];
    const root = await fsPromise.mkdtemp(path.join(os.tmpdir(), "akan-agent-ignore-"));
    const template = path.join(import.meta.dir, "../../cli/templates/workspaceRoot/.gitignore.template");
    await fsPromise.copyFile(template, path.join(root, ".gitignore"));
    Bun.spawnSync(["git", "init", "-q"], { cwd: root });
    const proc = Bun.spawn(["git", "check-ignore", "--no-index", "--stdin"], {
      cwd: root,
      stdin: new Blob([assets.map((asset) => asset.path).join("\n")]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [ignored, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    await fsPromise.rm(root, { recursive: true, force: true });
    expect({ exitCode, ignored: ignored.split("\n").filter(Boolean) }).toEqual({ exitCode: 1, ignored: [] });
  });
});
