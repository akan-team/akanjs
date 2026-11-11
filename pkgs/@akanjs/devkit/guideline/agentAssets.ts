import fsPromise from "node:fs/promises";
import path from "node:path";
import { akanCodePaths } from "../codeAgent/agent/akanCodePaths";
import { type ConventionRule, ConventionSet } from "./conventionSet";
import { Prompter } from "./prompter";

export interface AgentAsset {
  path: string;
  content: string;
}

interface ReferencePart {
  text: string;
  headings: string[];
}

export class AgentAssets {
  static readonly marker = "<!-- akan:generated -->";
  static readonly ruleDir = ".claude/rules/akan";
  static readonly skillRoots = [".claude/skills", ".agents/skills"] as const;
  //? Claude Code cuts a shell command's output at 30,000 characters, and an agent without a file reader `cat`s a part.
  static readonly referenceLimit = 28_000;
  static readonly ownedGlobs = [
    ".claude/rules/akan/*.md",
    ".cursor/rules/akan-*.mdc",
    ".claude/skills/akan-*/**",
    ".agents/skills/akan-*/**",
  ] as const;
  static readonly skillReferences = {
    "akan-validate": [],
    "akan-scaffold": ["workspaceRecipes"],
    "akan-module": ["moduleOverview", "modelConstant", "modelDictionary", "fieldRule"],
    "akan-scalar": ["scalarModule", "scalarConstant", "scalarDictionary"],
    "akan-service": ["modelService", "modelSignal", "modelDocument", "akanApi"],
    "akan-store": ["modelStore"],
    "akan-ui": [
      "ssrRule",
      "cssRule",
      "componentRule",
      "recipeRule",
      "modelTemplate",
      "modelUnit",
      "modelView",
      "modelZone",
      "modelUtil",
      "framework",
    ],
    "akan-err": ["errorCodes"],
    "akan-deps": [],
    "akan-debug": [],
    "akan-page": ["pageRule", "akanApi"],
    "akan-query": ["queryRule"],
    "akan-transport": ["transportRule"],
    "akan-runtime": ["runtimeRule"],
    "akan-mcp": ["mcpRule"],
    "akan-agent": ["agentRule"],
  } as const;

  static async rules({ appendix = {} }: { appendix?: Record<string, string> } = {}) {
    const conventions = await Prompter.getConventionSet();
    return conventions.rules.flatMap((rule) => AgentAssets.#ruleFiles(rule, appendix[rule.name]));
  }

  static rulePath(name: string) {
    return `${AgentAssets.ruleDir}/${name}.md`;
  }

  static #ruleFiles(rule: ConventionRule, appendix?: string): AgentAsset[] {
    const globs = rule.paths.flatMap((glob) => ConventionSet.expand(glob));
    const body = appendix ? `${rule.body}\n\n${appendix.trim()}` : rule.body;
    const claude = `---
description: ${rule.description}
paths:
${globs.map((glob) => `  - "${glob}"`).join("\n")}
---

${AgentAssets.marker}

${body}
`;
    const cursor = `---
description: ${rule.description}
globs: ${globs.join(",")}
alwaysApply: false
---

${AgentAssets.marker}

@${AgentAssets.rulePath(rule.name)}
`;
    return [
      { path: AgentAssets.rulePath(rule.name), content: claude },
      { path: `.cursor/rules/akan-${rule.name}.mdc`, content: cursor },
    ];
  }

  static async skills() {
    const dir = akanCodePaths.builtinSkillsDir();
    if (!dir) return [];
    const assets: AgentAsset[] = [];
    for (const [name, guidelines] of Object.entries(AgentAssets.skillReferences)) {
      const source = await fsPromise.readFile(path.join(dir, name, "SKILL.md"), "utf-8");
      const index: string[] = [];
      for (const guideline of guidelines) {
        const parts = AgentAssets.split(await Prompter.getInstruction(guideline));
        parts.forEach((part, idx) => {
          const file = parts.length === 1 ? `${guideline}.md` : `${guideline}-${idx + 1}.md`;
          const referencePath = `.agents/skills/${name}/references/${file}`;
          assets.push({ path: referencePath, content: `${AgentAssets.marker}\n\n${part.text.trim()}\n` });
          index.push(`- \`${referencePath}\` — ${AgentAssets.#summarize(part.headings)}`);
        });
      }
      const skill = AgentAssets.#skillFile(source, index);
      for (const root of AgentAssets.skillRoots) assets.push({ path: `${root}/${name}/SKILL.md`, content: skill });
    }
    return assets;
  }

  static split(markdown: string): ReferencePart[] {
    const sections: ReferencePart[] = [];
    let fenced = false;
    for (const line of markdown.trim().split("\n")) {
      if (line.startsWith("```")) fenced = !fenced;
      const heading = !fenced && line.startsWith("## ") ? line.slice(3).trim() : null;
      const last = sections.at(-1);
      if (heading !== null || !last) sections.push({ text: line, headings: heading === null ? [] : [heading] });
      else last.text += `\n${line}`;
    }
    const parts: ReferencePart[] = [];
    for (const section of sections) {
      const last = parts.at(-1);
      if (last && last.text.length + section.text.length + 1 <= AgentAssets.referenceLimit) {
        last.text += `\n${section.text}`;
        last.headings.push(...section.headings);
      } else parts.push({ text: section.text, headings: [...section.headings] });
    }
    return parts;
  }

  static #summarize(headings: string[]) {
    if (headings.length === 0) return "the whole guideline";
    const shown = headings.slice(0, 5).join(" · ");
    return headings.length > 5 ? `${shown} · …` : shown;
  }

  static #skillFile(source: string, index: string[]) {
    const match: RegExpExecArray | null = /^---\n[\s\S]*?\n---\n/.exec(source);
    const front = match?.[0] ?? "";
    const body = source.slice(front.length).trim();
    const references = index.length
      ? `\n\n## References\n\nThe full guidelines, split where each part fits one read; \`akan guideline show <name>\` prints the same text.\n\n${index.join("\n")}`
      : "";
    return `${front}\n${AgentAssets.marker}\n\n${body}${references}\n`;
  }

  static async generatedFiles(workspaceRoot: string) {
    const found: string[] = [];
    for (const pattern of AgentAssets.ownedGlobs) {
      for (const file of new Bun.Glob(pattern).scanSync({ cwd: workspaceRoot, dot: true, onlyFiles: true })) {
        const content = await Bun.file(path.join(workspaceRoot, file)).text();
        if (content.includes(AgentAssets.marker)) found.push(file.split(path.sep).join("/"));
      }
    }
    return found.sort((a, b) => a.localeCompare(b));
  }
}
