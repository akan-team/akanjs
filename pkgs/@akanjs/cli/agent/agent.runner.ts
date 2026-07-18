import { AkanContextAnalyzer, Prompter, runner, type Workspace } from "@akanjs/devkit";

type AgentTarget = "cursor" | "agents-md" | "claude";

const targetPaths: Record<AgentTarget, string> = {
  cursor: ".cursor/rules/akan.mdc",
  "agents-md": "AGENTS.md",
  claude: "CLAUDE.md",
};

const AGENT_BLOCK_START = "<!-- akan:agent:start -->";
const AGENT_BLOCK_END = "<!-- akan:agent:end -->";

// Reference samples scaffolded by `akan create-workspace`. They demonstrate the conventions but are not
// part of the product, so agents should remove them before building real features.
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

// Detect which scaffolded samples still exist so the guidance disappears once they are removed.
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

// The generated, workspace-derived section. It is the only part of AGENTS.md that
// `akan agent install` rewrites; everything outside the markers is preserved.
const renderManagedBlock = async (workspace: Workspace) => {
  const context = await AkanContextAnalyzer.analyze(workspace);
  const frameworkGuide = await Prompter.getInstruction("framework");
  const sampleCleanup = await renderSampleCleanup(
    workspace,
    context.apps.map((app) => app.name),
  );
  return `## Workspace

- Repo: ${context.repoName}
- Apps: ${context.apps.map((app) => app.name).join(", ") || "none"}
- Libraries: ${context.libs.map((lib) => lib.name).join(", ") || "none"}
- Packages: ${context.pkgs.map((pkg) => pkg.name).join(", ") || "none"}

${sampleCleanup}## Akan Module Abstracts

- Before changing a domain, service, or scalar module, read its \`*.abstract.md\` file first.
- Update the abstract when business invariants, workflows, or public behavior change.
- Do not update the abstract for formatting-only, import-only, or style-only changes.
- Service modules live in \`lib/_<service>\`, but their abstract file is \`<service>.abstract.md\`.

## Generated Files

Do not hand-edit generated Akan files such as ${context.generatedFiles.map((file) => `\`${file}\``).join(", ")}.
If generated output is stale or broken, update the owning source file and run \`akan repair generated\` or \`akan sync <app-or-lib>\`.

## MCP Workflow Policy

- Prefer Akan MCP workflows before direct source edits.
- Direct source edits are denied when an allowlisted Akan workflow or repair tool can perform the change.
- Use \`akan mcp --mode plan\` to inspect \`list_workflows\`, \`explain_workflow\`, and \`plan_workflow\`.
- If \`plan_workflow\` returns \`planPath\` or \`next.tool=apply_workflow\`, call \`apply_workflow({ planPath })\` before editing source files directly.
- Use \`akan mcp --mode apply\` only for allowlisted \`apply_workflow\`, \`run_validation\`, and repair tools.
- After \`apply_workflow\`, run \`run_validation\` with \`validationTarget\` when present; otherwise use \`applyReportPath\`.
- If no workflow exists, or apply reports unsupported/no-op/failed diagnostics that require manual action, keep edits scoped to owning source files and never patch generated files directly.
- For compound requests, split the request into workflows and apply each \`planPath\` in order, such as \`create-module\` followed by \`add-field\`.
- **CLI-only fallback (MCP not connected):** \`akan mcp\` starts a stdio MCP server, so the \`list_workflows\`/\`plan_workflow\`/\`apply_workflow\` tools exist only when your agent is wired to it as an MCP client. When they are unavailable, the CLI is a first-class equivalent: \`akan workflow list\` / \`explain <name>\` / \`plan <name> ... --format json --out <planPath>\` / \`apply <planPath> --format json\`, \`akan doctor --strict --format json\` for validation, and \`akan repair generated|imports|module-shape --app <app> --format json\` for repairs. Scaffolding primitives (\`create-module\`/\`create-scalar\`/\`create-service\` take the target app/lib as a POSITIONAL arg; \`add-field\`/\`add-enum-field\` use \`--app\`/\`--module\` flags) call the same code the workflows do.

## Validation

${context.validationCommands.map((command) => `- \`${command}\``).join("\n")}

## Framework Guide

${frameworkGuide.trim()}`;
};

// Replace the content between the akan:agent markers, preserving everything else.
// When the markers are absent (a hand-written or freshly scaffolded AGENTS.md), append them.
const upsertManagedBlock = (existing: string, block: string) => {
  const managed = `${AGENT_BLOCK_START}\n${block}\n${AGENT_BLOCK_END}`;
  const startIndex = existing.indexOf(AGENT_BLOCK_START);
  const endIndex = existing.indexOf(AGENT_BLOCK_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    return `${existing.slice(0, startIndex)}${managed}${existing.slice(endIndex + AGENT_BLOCK_END.length)}`;
  }
  return `${existing.replace(/\s*$/, "")}\n\n${managed}\n`;
};

const renderAgentsMd = async (workspace: Workspace, existing: string | null) => {
  const block = await renderManagedBlock(workspace);
  if (existing?.trim()) return upsertManagedBlock(existing, block);
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

// Claude Code natively imports other files with \`@path\`, so CLAUDE.md stays a thin pointer to AGENTS.md
// instead of duplicating its content.
const renderClaudeMd = async (workspace: Workspace) => {
  const context = await AkanContextAnalyzer.analyze(workspace);
  return `# ${context.repoName} — Claude Code Guide

@AGENTS.md
`;
};

// Cursor rules reference AGENTS.md rather than carrying their own copy.
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
  async install(workspace: Workspace, targets: AgentTarget[], { force = false }: { force?: boolean } = {}) {
    const written: string[] = [];
    for (const target of targets) {
      const filePath = targetPaths[target];
      const exists = await workspace.exists(filePath);
      // AGENTS.md updates only the managed block, so refreshing an existing file is safe without --force.
      // CLAUDE.md and the Cursor rule are canonical pointers, so overwriting them needs --force.
      if (exists && !force && target !== "agents-md") {
        throw new Error(`${filePath} already exists. Re-run with --force to overwrite it.`);
      }
      const existing = exists ? await workspace.readFile(filePath) : null;
      const content = await renderTarget(workspace, target, existing);
      await workspace.writeFile(filePath, content, { overwrite: true });
      written.push(filePath);
    }
    return written;
  }
}
