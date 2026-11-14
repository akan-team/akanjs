import { runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AkanContextAnalyzer } from "@akanjs/devkit/context/akanContext";
import { collectRecipeSources, scanRecipes } from "@akanjs/devkit/context/recipeScanner";
import { AppExecutor, LibExecutor } from "@akanjs/devkit/executors";
import { type AgentAsset, AgentAssets } from "@akanjs/devkit/guideline/agentAssets";
import {
  AGENT_BLOCK_END,
  AGENT_BLOCK_START,
  CLAUDE_COMMENT_RULE,
  readDevkitVersion,
  renderRecipeEntries,
  stampBlockVersion,
  upsertAgentBlock,
} from "@akanjs/devkit/guideline/agentsIndex";
import { Prompter } from "@akanjs/devkit/guideline/prompter";
import { Logger } from "akanjs/common";
import { AgentHook } from "./agentHook";

export type AgentTarget = "cursor" | "agents-md" | "claude" | "rules" | "skills" | "hooks";
type PointerTarget = Exclude<AgentTarget, "rules" | "skills" | "hooks">;

export interface AgentDrift {
  path: string;
  change: "missing" | "outdated" | "retired";
}

//? The stamp follows whichever CLI rendered the block and `akan doctor` reports it apart, so a check compares content.
const unstamped = (content: string) => content.replace(/<!-- akan:agent:version \S+ -->\n\n/, "");

const targetPaths: Record<PointerTarget, string> = {
  cursor: ".cursor/rules/akan.mdc",
  "agents-md": "AGENTS.md",
  claude: "CLAUDE.md",
};

// Scaffolded by `akan create-workspace` to show the conventions; not product code, so the guide asks for removal.
const SAMPLE_ARTIFACTS = [
  { probe: "lib/task/task.constant.ts", target: "lib/task", label: "sample database module" },
  { probe: "lib/_noti/noti.service.ts", target: "lib/_noti", label: "sample service module" },
  {
    probe: "lib/__scalar/workHistory/workHistory.dictionary.ts",
    target: "lib/__scalar/workHistory",
    label: "sample scalar module",
  },
  { probe: "page/task/_index.tsx", target: "page/task", label: "sample task pages" },
] as const;
const DEFAULT_INDEX_MARKER = "Akan.js template";

const renderSampleCleanup = async (workspace: Workspace, appNames: string[]) => {
  const items: string[] = [];
  for (const appName of appNames) {
    for (const artifact of SAMPLE_ARTIFACTS) {
      if (await workspace.exists(`apps/${appName}/${artifact.probe}`)) {
        items.push(
          `- \`apps/${appName}/${artifact.target}\` — ${artifact.label}; delete it once you no longer need the reference.`,
        );
      }
    }
    const indexPath = `apps/${appName}/page/_index.tsx`;
    if (await workspace.exists(indexPath)) {
      const content = await workspace.readFile(indexPath).catch(() => "");
      if (content.includes(DEFAULT_INDEX_MARKER)) {
        items.push(`- \`${indexPath}\` — default Akan landing page; replace it with your own home page.`);
      }
    }
  }
  if (items.length === 0) return "";
  return `## Start Clean (Remove Scaffolded Samples)

This workspace was scaffolded with reference samples so the Akan conventions are visible in real code. They are
not part of your product. Before building real features, remove the samples below and run \`akan sync <app>\`:

${items.join("\n")}

Keep a sample only while you are still learning its pattern; delete it once your own modules cover the same ground.

`;
};

// Framework recipes only: app/lib recipes live in each scope's own AGENTS.md. `akanjs` is published as source,
// so a workspace outside the monorepo scans its installed copy.
const renderFrameworkRecipes = async (workspace: Workspace) => {
  const monorepo = `${workspace.workspaceRoot}/pkgs/akanjs/ui`;
  const uiDir = (await workspace.exists("pkgs/akanjs/ui"))
    ? monorepo
    : `${workspace.workspaceRoot}/node_modules/akanjs/ui`;
  const recipes = scanRecipes(await collectRecipeSources(uiDir, "akanjs/ui", "recipe"));
  if (recipes.length === 0) return "";
  return `The framework recipes (\`*\` marks the default, \`key?\` is a boolean flag) — the full contract:

${renderRecipeEntries(recipes)}`;
};

const renderPathRules = (rules: { name: string; paths: string[] }[]) => `## Path Rules

Each area's full contract is a rule file. Claude Code and Cursor load it when a matching file is touched; any other
agent reads it before editing a match.

| Files | Rule |
|---|---|
${rules.map((rule) => `| ${rule.paths.map((glob) => `\`${glob}\``).join(", ")} | \`${AgentAssets.rulePath(rule.name)}\` |`).join("\n")}

Skills in \`.claude/skills/\` and \`.agents/skills/\` carry procedures and the full guidelines:
${Object.keys(AgentAssets.skillReferences)
  .map((name) => `\`${name}\``)
  .join(", ")}. \`akan guideline show <name>\` prints any
guideline.

`;

const maxListedChars = 160;

const renderNames = (names: string[]) => {
  if (!names.length) return "none";
  const shown: string[] = [];
  let length = 0;
  for (const name of names) {
    if (shown.length && length + name.length > maxListedChars) break;
    shown.push(name);
    length += name.length + 2;
  }
  const rest = names.length - shown.length;
  return rest ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ");
};

const renderManagedBlock = async (workspace: Workspace) => {
  const context = await AkanContextAnalyzer.analyze(workspace);
  const conventions = await Prompter.getConventionSet();
  const appNames = context.apps.map((app) => app.name);
  const sampleCleanup = await renderSampleCleanup(workspace, appNames);
  const version = await readDevkitVersion();
  const block = `## Workspace

- Repo: ${context.repoName}
- Apps: ${renderNames(appNames)}
- Libraries: ${renderNames(context.libs.map((lib) => lib.name))}
- Packages: ${renderNames(context.pkgs.map((pkg) => pkg.name))}

${conventions.core}

${renderPathRules(conventions.rules)}${sampleCleanup}## Generated Files

Never hand-edit ${context.generatedFiles.map((file) => `\`${file}\``).join(", ")}. When one is stale or broken, fix the
owning source file and run \`akan sync <app-or-lib>\` or \`akan repair generated\`.`;
  return version ? stampBlockVersion(block, version) : block;
};

const renderAgentsMd = async (workspace: Workspace, existing: string | null) => {
  const block = await renderManagedBlock(workspace);
  if (existing?.trim()) return upsertAgentBlock(existing, block);
  const context = await AkanContextAnalyzer.analyze(workspace);
  return `# ${context.repoName} Agent Guide

This file is the single source of truth for coding agents in this workspace. Claude Code reads it through
\`CLAUDE.md\` (\`@AGENTS.md\`) and Cursor through \`.cursor/rules/akan.mdc\`. The section between the
\`akan:agent\` markers is regenerated by \`akan agent install\`; edit anything outside the markers freely.

${AGENT_BLOCK_START}
${block}
${AGENT_BLOCK_END}
`;
};

// Claude Code imports files with `@path`, so CLAUDE.md stays a pointer; only the comment rule is restated.
const renderClaudeMd = async (workspace: Workspace) => {
  const context = await AkanContextAnalyzer.analyze(workspace);
  return `# ${context.repoName} — Claude Code Guide

@AGENTS.md

${CLAUDE_COMMENT_RULE}
`;
};

const renderCursorRule = () => `---
description: Akan workspace agent guide
alwaysApply: true
---

Follow the workspace agent guide, which is the single source of truth for Akan conventions,
generated-file rules, and the MCP workflow policy.

@AGENTS.md
`;

const renderTarget = async (workspace: Workspace, target: AgentTarget, existing: string | null) => {
  if (target === "agents-md") return await renderAgentsMd(workspace, existing);
  if (target === "claude") return await renderClaudeMd(workspace);
  return renderCursorRule();
};

export class AgentRunner extends runner("agent") {
  async renderBlock(workspace: Workspace) {
    return await renderManagedBlock(workspace);
  }

  async install(workspace: Workspace, targets: AgentTarget[], { force = false }: { force?: boolean } = {}) {
    return await this.#apply(workspace, targets, force, null);
  }

  //* The scoped AGENTS.md blocks are left out: every `akan sync` rewrites them and `akan lint` fails while one is stale.
  async check(workspace: Workspace, targets: AgentTarget[]) {
    const drift: AgentDrift[] = [];
    await this.#apply(workspace, targets, false, drift);
    return drift;
  }

  async #apply(workspace: Workspace, targets: AgentTarget[], force: boolean, drift: AgentDrift[] | null) {
    const written: string[] = [];
    for (const target of targets) {
      if (target === "rules" || target === "skills" || target === "hooks") continue;
      const filePath = targetPaths[target];
      const exists = await workspace.exists(filePath);
      // AGENTS.md rewrites only its managed block; the CLAUDE.md and Cursor pointers are the user's once they exist.
      if (exists && !force && target !== "agents-md") {
        if (!drift) Logger.rawLog(`Kept ${filePath}: it already exists, and --force overwrites it.`);
        continue;
      }
      const existing = exists ? await workspace.readFile(filePath) : null;
      await this.#put(workspace, filePath, await renderTarget(workspace, target, existing), drift);
      written.push(filePath);
    }
    if (targets.includes("rules")) {
      const appendix = { style: await renderFrameworkRecipes(workspace) };
      const assets = await AgentAssets.rules({ appendix });
      written.push(await this.#writeAssets(workspace, assets, /^\.(claude|cursor)\/rules\//, force, "rules", drift));
    }
    if (targets.includes("skills")) {
      const assets = await AgentAssets.skills();
      written.push(await this.#writeAssets(workspace, assets, /^\.(claude|agents)\/skills\//, force, "skills", drift));
    }
    if (targets.includes("hooks")) written.push(await this.#installHooks(workspace, drift));
    if (targets.includes("agents-md") && !drift) written.push(...(await this.#installScopeIndexes(workspace)));
    return written;
  }

  async #put(workspace: Workspace, file: string, content: string, drift: AgentDrift[] | null) {
    if (!drift) return (await workspace.writeFile(file, content, { overwrite: true, silent: true })).written;
    const current = (await workspace.exists(file)) ? await workspace.readFile(file) : null;
    if (current === null) drift.push({ path: file, change: "missing" });
    else if (unstamped(current) !== unstamped(content)) drift.push({ path: file, change: "outdated" });
    return false;
  }

  async #installHooks(workspace: Workspace, drift: AgentDrift[] | null) {
    const settingsPath = ".claude/settings.json";
    const existing = (await workspace.exists(settingsPath))
      ? (JSON.parse(await workspace.readFile(settingsPath)) as Record<string, unknown>)
      : {};
    await this.#put(workspace, settingsPath, `${JSON.stringify(AgentHook.mergeSettings(existing), null, 2)}\n`, drift);
    return `hooks: ${settingsPath}`;
  }

  // A generated file the user stripped of its marker is theirs: it is neither rewritten nor pruned without --force.
  async #writeAssets(
    workspace: Workspace,
    assets: AgentAsset[],
    owned: RegExp,
    force: boolean,
    label: string,
    drift: AgentDrift[] | null,
  ) {
    const fresh = new Set(assets.map((asset) => asset.path));
    const stale = (await AgentAssets.generatedFiles(workspace.workspaceRoot)).filter(
      (file) => owned.test(file) && !fresh.has(file),
    );
    if (drift) drift.push(...stale.map((file) => ({ path: file, change: "retired" as const })));
    else for (const file of stale) await workspace.remove(file);
    let changed = 0;
    for (const asset of assets) {
      if (!force && (await workspace.exists(asset.path))) {
        const current = await workspace.readFile(asset.path);
        if (!current.includes(AgentAssets.marker)) {
          if (!drift)
            Logger.rawLog(`Kept ${asset.path}: it carries no ${AgentAssets.marker} marker, and --force overwrites it.`);
          continue;
        }
      }
      if (await this.#put(workspace, asset.path, asset.content, drift)) changed++;
    }
    const removed = stale.length ? `, ${stale.length} stale removed` : "";
    return `${label}: ${assets.length} files, ${changed} changed${removed}`;
  }

  // First-time layout; `akan sync` keeps them fresh. Best-effort per scope: one whose config/env cannot load yet
  // must not block the workspace-level install.
  async #installScopeIndexes(workspace: Workspace) {
    const [appNames, libNames] = await workspace.getExecs();
    const written: string[] = [];
    const syncScope = async (exec: AppExecutor | LibExecutor) => {
      try {
        await exec.syncAgentsIndex();
        written.push(`${exec.type}s/${exec.name}/AGENTS.md`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.rawLog(`Skipped ${exec.type}s/${exec.name}/AGENTS.md (${message})`, undefined, "error");
      }
    };
    for (const name of libNames) await syncScope(LibExecutor.from(workspace, name));
    for (const name of appNames) await syncScope(AppExecutor.from(workspace, name));
    return written;
  }
}
