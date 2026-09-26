import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type AkanContextFile, AkanContextFiles } from "./AkanContextFiles";

const roots: string[] = [];

const workspace = (files: Record<string, string>) => {
  const root = mkdtempSync(path.join(tmpdir(), "akan-context-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
};

/** What the engine hands over: the one context file it took for that directory. */
const loaded = (root: string, name = "AGENTS.md"): AkanContextFile[] => [
  { path: path.join(root, name), content: "the workspace guide" },
];

const namesOf = (files: AkanContextFile[], root: string) =>
  files.map((file) => path.relative(root, file.path).split(path.sep).join("/"));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace context files", () => {
  test("a CLAUDE.md beside the AGENTS.md the engine took is loaded too", () => {
    const root = workspace({ "AGENTS.md": "the workspace guide", "CLAUDE.md": "comments override" });
    const files = AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root });
    expect(namesOf(files, root)).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(files[1]?.content).toBe("comments override");
  });

  test("an AGENTS.override.md keeps the CLAUDE.md it was written to displace out", () => {
    const root = workspace({ "AGENTS.override.md": "instead of that", "CLAUDE.md": "the old one" });
    const files = AkanContextFiles.extend(loaded(root, "AGENTS.override.md"), { workspaceRoot: root, cwd: root });
    expect(namesOf(files, root)).toEqual(["AGENTS.override.md"]);
  });

  test("the same guide under two names is loaded once", () => {
    const root = workspace({ "AGENTS.md": "the workspace guide" });
    symlinkSync(path.join(root, "AGENTS.md"), path.join(root, "CLAUDE.md"));
    expect(namesOf(AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root }), root)).toEqual([
      "AGENTS.md",
    ]);
  });

  test("an always-on cursor rule is loaded without its frontmatter", () => {
    const root = workspace({
      ".cursor/rules/house.mdc": "---\ndescription: house style\nalwaysApply: true\n---\nnever use any\n",
    });
    const files = AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root });
    expect(namesOf(files, root)).toEqual(["AGENTS.md", ".cursor/rules/house.mdc"]);
    expect(files[1]?.content).toBe("never use any\n");
  });

  /** Cursor's other three kinds are conditional; applying one always is applying a rule its author scoped. */
  test("a scoped cursor rule is left to cursor", () => {
    const root = workspace({
      ".cursor/rules/ui.mdc": "---\nglobs: ui/**/*.tsx\n---\nno inline colours\n",
      ".cursor/rules/ask.mdc": "---\ndescription: for migrations\n---\nread the plan\n",
      ".cursor/rules/off.mdc": "---\nalwaysApply: false\n---\nnot this one\n",
    });
    expect(namesOf(AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root }), root)).toEqual([
      "AGENTS.md",
    ]);
  });

  test("a rule with no frontmatter at all is unconditional, and so is .cursorrules", () => {
    const root = workspace({ ".cursor/rules/plain.mdc": "just do it", ".cursorrules": "the legacy file" });
    const files = AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root });
    expect(namesOf(files, root).sort()).toEqual([".cursorrules", ".cursor/rules/plain.mdc", "AGENTS.md"].sort());
  });

  test("rules nested under the rules directory are found, in a stable order", () => {
    const root = workspace({
      ".cursor/rules/b.mdc": "---\nalwaysApply: true\n---\nsecond\n",
      ".cursor/rules/a.mdc": "---\nalwaysApply: true\n---\nfirst\n",
      ".cursor/rules/deep/c.mdc": "---\nalwaysApply: true\n---\nthird\n",
    });
    const files = AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root });
    expect(namesOf(files, root)).toEqual([
      "AGENTS.md",
      ".cursor/rules/a.mdc",
      ".cursor/rules/b.mdc",
      ".cursor/rules/deep/c.mdc",
    ]);
  });

  test("the session's own directory carries its rules as well as the workspace root", () => {
    const root = workspace({
      ".cursor/rules/root.mdc": "---\nalwaysApply: true\n---\nworkspace wide\n",
      "apps/akan/.cursor/rules/app.mdc": "---\nalwaysApply: true\n---\napp only\n",
    });
    const cwd = path.join(root, "apps", "akan");
    const files = AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd });
    expect(namesOf(files, root)).toEqual(["AGENTS.md", ".cursor/rules/root.mdc", "apps/akan/.cursor/rules/app.mdc"]);
  });

  test("an empty rule file adds nothing", () => {
    const root = workspace({ ".cursor/rules/empty.mdc": "---\nalwaysApply: true\n---\n\n" });
    expect(AkanContextFiles.extend(loaded(root), { workspaceRoot: root, cwd: root })).toHaveLength(1);
  });

  test("nothing to add leaves the list exactly as the engine built it", () => {
    const root = workspace({ "AGENTS.md": "the workspace guide" });
    const base = loaded(root);
    expect(AkanContextFiles.extend(base, { workspaceRoot: root, cwd: root })).toEqual(base);
  });
});
