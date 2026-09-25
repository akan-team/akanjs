import { readdir } from "node:fs/promises";
import path from "node:path";
import { capitalize } from "akanjs/common";
import { AppExecutor, LibExecutor, type SysExecutor, type WorkspaceExecutor } from "./executors";
import { FileSys } from "./fileSys";
import type { PackageJson } from "./types";
import {
  type GeneratedSyncState,
  type RepairAction,
  type WorkflowApplyReport,
  type WorkflowPlan,
  type WorkflowRunArtifact,
  workflowRunArtifactPath,
  workflowSyncDir,
} from "./workflow";

export type AkanContextFormat = "json" | "markdown";
export type AkanModuleKind = "domain" | "service" | "scalar";
export type AkanDiagnosticSeverity = "warning" | "error";

export interface AkanAbstractSummary {
  path: string;
  exists: boolean;
  title?: string;
  headings: string[];
  content?: string;
}

export interface AkanModuleContext {
  kind: AkanModuleKind;
  name: string;
  folderName: string;
  sysName: string;
  sysType: "app" | "lib";
  path: string;
  abstract: AkanAbstractSummary;
  files: string[];
}

export interface AkanSysContext {
  type: "app" | "lib";
  name: string;
  path: string;
  hasConfig: boolean;
  modules: AkanModuleContext[];
}

export interface AkanPackageContext {
  name: string;
  path: string;
  version?: string;
}

export interface AkanWorkspaceContext {
  schemaVersion: 1;
  repoName: string;
  root: string;
  packageVersion?: string;
  apps: AkanSysContext[];
  libs: AkanSysContext[];
  pkgs: AkanPackageContext[];
  generatedFiles: string[];
  validationCommands: string[];
}

export interface AkanDiagnostic {
  severity: AkanDiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  repairActions?: RepairAction[];
  scope?: "baseline" | "workflow" | "unknown";
  context?: {
    workflow?: string;
    planPath?: string;
    runId?: string;
    target?: string;
    paths?: string[];
  };
}

export interface GeneratedFilesFreshness {
  status: "fresh" | "stale" | "missing" | "unknown";
  message: string;
  refreshCommand: string;
  verifyingCommands: string[];
  targets?: {
    target: string;
    status: "fresh" | "stale" | "missing" | "unknown";
    lastSyncedAt?: string;
    runId?: string;
    generatedFiles: string[];
    reason: string;
  }[];
}

export interface AkanDoctorResult {
  schemaVersion: 1;
  repoName: string;
  root: string;
  strict: boolean;
  status: "passed" | "failed";
  diagnostics: AkanDiagnostic[];
  generatedFiles: string[];
  generatedFilesFreshness: GeneratedFilesFreshness;
  validationCommands: string[];
  repairActions: RepairAction[];
  baselineDiagnostics?: AkanDiagnostic[];
  workflowDiagnostics?: AkanDiagnostic[];
}

export type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

export type McpFraming = "content-length" | "newline";
export type AkanMcpMode = "readonly" | "plan" | "apply";

// Coding-agent tools that can host the Akan MCP server. Cursor and Claude Code both read a JSON
// `mcpServers` map; Codex reads a TOML `[mcp_servers.<name>]` table.
export type AkanMcpInstallTarget = "cursor" | "claude" | "codex";

export type CursorMcpConfig = {
  mcpServers?: Record<string, unknown>;
};

export const resourceList = [
  { uri: "akan://docs/framework", name: "Akan framework guide", mimeType: "text/markdown" },
  { uri: "akan://guidelines/framework", name: "Framework guideline", mimeType: "text/markdown" },
  { uri: "akan://guidelines/modelSignal", name: "Model signal guideline", mimeType: "text/markdown" },
  { uri: "akan://workspace/summary", name: "Workspace summary", mimeType: "application/json" },
  { uri: "akan://workspace/apps", name: "Workspace apps", mimeType: "application/json" },
  { uri: "akan://workspace/modules", name: "Workspace modules", mimeType: "application/json" },
];

export const cursorMcpConfigPath = ".cursor/mcp.json";
// Claude Code reads project-scoped MCP servers from `.mcp.json` at the workspace root.
export const claudeMcpConfigPath = ".mcp.json";
// Codex reads project-scoped config (trusted projects) from `.codex/config.toml`.
export const codexMcpConfigPath = ".codex/config.toml";

export const akanMcpInstallTargets: AkanMcpInstallTarget[] = ["cursor", "claude", "codex"];

export const akanMcpInstallConfigPaths: Record<AkanMcpInstallTarget, string> = {
  cursor: cursorMcpConfigPath,
  claude: claudeMcpConfigPath,
  codex: codexMcpConfigPath,
};

// `akan mcp` resolves the workspace from process.cwd(), so every launcher must run it from the
// workspace root. Cursor expands its own ${workspaceFolder} variable. Claude Code does not guarantee
// the server's cwd but sets CLAUDE_PROJECT_DIR in its environment, so we cd into that at runtime.
// Codex inherits its own launch cwd (it also discovers .codex/config.toml from cwd), so it runs the
// command directly and must be started from the workspace root.
const cursorWorkspaceFolder = "$" + "{workspaceFolder}";
const claudeProjectDir = "$CLAUDE_PROJECT_DIR";

const akanMcpCommand = (mode: AkanMcpMode, { cd }: { cd?: string } = {}) =>
  cd ? `cd "${cd}" && akan mcp --mode ${mode}` : `akan mcp --mode ${mode}`;

export const createAkanCursorMcpServer = (mode: AkanMcpMode = "readonly") => ({
  type: "stdio",
  command: "bash",
  args: ["-lc", akanMcpCommand(mode, { cd: cursorWorkspaceFolder })],
});

export const createAkanClaudeMcpServer = (mode: AkanMcpMode = "readonly") => ({
  type: "stdio",
  command: "bash",
  args: ["-lc", akanMcpCommand(mode, { cd: claudeProjectDir })],
});

// JSON-config targets (Cursor, Claude Code) share the same `mcpServers` entry shape.
export const createAkanMcpServer = (target: "cursor" | "claude", mode: AkanMcpMode = "readonly") =>
  target === "cursor" ? createAkanCursorMcpServer(mode) : createAkanClaudeMcpServer(mode);

export const akanCursorMcpServer = createAkanCursorMcpServer();

// Codex config is TOML and we have no TOML serializer, so we build the `[mcp_servers.akan]` table as text.
export const codexMcpServerTableHeader = "[mcp_servers.akan]";
export const createAkanCodexMcpServerBlock = (mode: AkanMcpMode = "readonly") =>
  `${codexMcpServerTableHeader}\ncommand = "bash"\nargs = ["-lc", "${akanMcpCommand(mode)}"]\n`;

// A TOML table runs from its header until the next top-level `[header]` or EOF. We upsert only the
// akan table and preserve everything else in the file, mirroring the JSON merge behavior.
const codexAkanTablePattern = /^\[mcp_servers\.akan\][^\n]*\n(?:(?!\[)[^\n]*(?:\n|$))*/m;

export const upsertCodexMcpServerBlock = (
  existing: string,
  block: string,
  { force = false }: { force?: boolean } = {},
) => {
  const nextBlock = block.endsWith("\n") ? block : `${block}\n`;
  const match = existing.match(codexAkanTablePattern);
  if (!match) {
    if (!existing.trim()) return nextBlock;
    return `${existing.replace(/\s*$/, "")}\n\n${nextBlock}`;
  }
  if (match[0].trim() === nextBlock.trim()) return existing;
  if (!force)
    throw new Error(`${codexMcpConfigPath} already has an "akan" MCP server. Re-run with --force to overwrite it.`);
  const start = match.index ?? 0;
  const before = existing.slice(0, start);
  const after = existing.slice(start + match[0].length);
  // The matched table absorbed its trailing blank line, so re-insert one before any following table.
  const separator = after && !after.startsWith("\n") ? "\n" : "";
  return `${before}${nextBlock}${separator}${after}`;
};

export const renderDoctorText = (result: AkanDoctorResult) => {
  const lines = [`Akan doctor status: ${result.status}`];
  if (result.diagnostics.length === 0) {
    lines.push("", "No Akan workspace diagnostics found.");
  } else {
    lines.push(
      "",
      ...result.diagnostics.map((diagnostic) =>
        [
          `[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`,
          diagnostic.path ? `  ${diagnostic.path}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    );
  }
  lines.push(
    "",
    "Generated file freshness:",
    `Status: ${result.generatedFilesFreshness.status}`,
    result.generatedFilesFreshness.message,
    `Refresh: ${result.generatedFilesFreshness.refreshCommand}`,
    "",
    "Repair actions:",
    ...(result.repairActions.length ? result.repairActions.map((action) => `- ${action.command}`) : ["- none"]),
    "",
    "Validation commands:",
    ...result.validationCommands.map((command) => `- ${command}`),
  );
  return `${lines.join("\n")}\n`;
};

export interface AkanContextOptions {
  app?: string | null;
  module?: string | null;
  includeAbstractContent?: boolean;
}

const generatedFiles = [
  "apps/*/client.ts",
  "apps/*/server.ts",
  "*/lib/cnst.ts",
  "*/lib/db.ts",
  "*/lib/dict.ts",
  "*/lib/sig.ts",
  "*/lib/srv.ts",
  "*/lib/st.ts",
  "*/lib/useClient.ts",
  "*/lib/useServer.ts",
  "*/lib/**/index.ts",
  "*/ui/index.ts",
  "*/webkit/index.ts",
  "*/srvkit/index.ts",
  "*/common/index.ts",
];

const validationCommands = [
  "akan sync <app-or-lib>",
  "akan lint <app-or-lib-or-pkg>",
  "akan typecheck <app-name>",
  "akan test <app-or-lib-or-pkg>",
  "akan build <app-name>",
  "akan doctor --strict --format json",
];

const unknownGeneratedFilesFreshness: GeneratedFilesFreshness = {
  status: "unknown" as const,
  message: "Run sync before validation so generated Akan files match the current source conventions.",
  refreshCommand: "akan sync <app-or-lib>",
  verifyingCommands: ["akan lint <app-or-lib-or-pkg>", "akan build <app-name>"],
};

const repairAction = (
  kind: RepairAction["kind"],
  command: string,
  reason: string,
  safeToRun: boolean,
): RepairAction => ({
  kind,
  command,
  reason,
  safeToRun,
});

const moduleShapeFiles = (module: AkanModuleContext) => {
  if (module.kind === "service") {
    return [`${module.name}.dictionary.ts`, `${module.name}.service.ts`, `${module.name}.signal.ts`];
  }
  if (module.kind === "scalar") return [`${module.name}.constant.ts`, `${module.name}.dictionary.ts`];
  return [
    `${module.name}.constant.ts`,
    `${module.name}.dictionary.ts`,
    `${module.name}.service.ts`,
    `${module.name}.store.ts`,
    `${module.name}.signal.ts`,
  ];
};

const constantFieldNames = (content: string) =>
  [...content.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*field\(/g)].map((match) => match[1]).filter(Boolean);

const appRootAllowFiles = new Set([
  "akan.app.json",
  "akan.config.ts",
  "capacitor.config.ts",
  "client.ts",
  "main.ts",
  "package.json",
  "server.ts",
  "tsconfig.json",
]);

const appRootAllowDirs = new Set([
  ".akan",
  "android",
  "common",
  "env",
  "ios",
  "lib",
  "page",
  "private",
  "public",
  "script",
  "srvkit",
  "ui",
  "webkit",
]);

const safeReadDir = async (dirPath: string) => {
  try {
    return (await readdir(dirPath, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
};

const safeReadText = async (filePath: string) => {
  try {
    return await FileSys.readText(filePath);
  } catch {
    return null;
  }
};

const safeReadJson = async <T>(filePath: string) => {
  try {
    return await FileSys.readJson<T>(filePath);
  } catch {
    return null;
  }
};

const isWorkflowPlan = (value: unknown): value is WorkflowPlan =>
  typeof value === "object" &&
  value !== null &&
  "schemaVersion" in value &&
  value.schemaVersion === 1 &&
  "mode" in value &&
  value.mode === "plan";

const isWorkflowApplyReport = (value: unknown): value is WorkflowApplyReport =>
  typeof value === "object" &&
  value !== null &&
  "schemaVersion" in value &&
  value.schemaVersion === 1 &&
  "mode" in value &&
  (value.mode === "apply" || value.mode === "dry-run");

const isWorkflowRunArtifact = (value: unknown): value is WorkflowRunArtifact =>
  typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 1;

const planInputString = (plan: WorkflowPlan, key: string) => {
  const value = plan.inputs[key];
  return typeof value === "string" ? value : "";
};

const expandWorkflowTarget = (target: string, plan: WorkflowPlan) => {
  const app = planInputString(plan, "app");
  const module = planInputString(plan, "module");
  const moduleClass = module ? capitalize(module) : "<Module>";
  return target
    .replace(/^\*\//, app ? `apps/${app}/` : "")
    .replaceAll("<module>", module || "<module>")
    .replaceAll("<Module>", moduleClass);
};

const workflowPathsForPlan = (plan: WorkflowPlan) =>
  plan.predictedChanges.map((change) => expandWorkflowTarget(change.target, plan));

const workflowPathsForArtifact = (artifact: WorkflowRunArtifact) => {
  if (isWorkflowPlan(artifact)) return workflowPathsForPlan(artifact);
  if (isWorkflowApplyReport(artifact)) {
    return [
      ...artifact.changedFiles.map((file) => file.path),
      ...artifact.generatedFiles.map((file) => file.path),
      ...workflowPathsForPlan(artifact.plan),
    ];
  }
  if ("mode" in artifact && artifact.mode === "validate" && artifact.plan) return workflowPathsForPlan(artifact.plan);
  return [];
};

const loadWorkflowContextPaths = async (
  workspace: WorkspaceExecutor,
  runIdOrPlan: string | null,
  changedFiles: string[],
) => {
  const paths = [...changedFiles];
  if (!runIdOrPlan) return paths;
  const inputPath = path.isAbsolute(runIdOrPlan) ? runIdOrPlan : path.join(workspace.workspaceRoot, runIdOrPlan);
  const artifact =
    (await safeReadJson<WorkflowRunArtifact | WorkflowPlan>(inputPath)) ??
    (await safeReadJson<WorkflowRunArtifact>(path.join(workspace.workspaceRoot, workflowRunArtifactPath(runIdOrPlan))));
  if (artifact && isWorkflowRunArtifact(artifact)) paths.push(...workflowPathsForArtifact(artifact));
  return [...new Set(paths.filter(Boolean))];
};

const pathKey = (value: string) =>
  value
    .replaceAll("\\", "/")
    .replaceAll("*", "")
    .replace(/<[^>]+>/g, "")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");

const isWorkflowRelatedDiagnostic = (diagnostic: AkanDiagnostic, workflowPaths: string[]) => {
  if (!diagnostic.path) return false;
  const diagnosticPath = pathKey(diagnostic.path);
  return workflowPaths.some((workflowPath) => {
    const candidate = pathKey(workflowPath);
    if (!candidate) return false;
    return (
      diagnosticPath.startsWith(candidate) || candidate.startsWith(diagnosticPath) || diagnosticPath.includes(candidate)
    );
  });
};

const readGeneratedSyncStates = async (workspace: WorkspaceExecutor) => {
  const syncDir = path.join(workspace.workspaceRoot, workflowSyncDir);
  const entries = await safeReadDir(syncDir);
  const states = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => safeReadJson<GeneratedSyncState>(path.join(syncDir, entry.name))),
  );
  return states.filter(
    (state): state is GeneratedSyncState =>
      !!state && state.schemaVersion === 1 && typeof state.target === "string" && typeof state.syncedAt === "string",
  );
};

const generatedFreshnessFromStates = async (workspace: WorkspaceExecutor): Promise<GeneratedFilesFreshness> => {
  const states = await readGeneratedSyncStates(workspace);
  if (states.length === 0) return unknownGeneratedFilesFreshness;
  const targets = states
    .sort((a, b) => a.target.localeCompare(b.target))
    .map((state) => ({
      target: state.target,
      status: state.status === "passed" ? ("fresh" as const) : ("stale" as const),
      lastSyncedAt: state.syncedAt,
      runId: state.runId,
      generatedFiles: state.generatedFiles.map((file) => file.path),
      reason:
        state.status === "passed"
          ? `Generated files were refreshed by ${state.command}.`
          : `Last generated repair command failed: ${state.command}.`,
    }));
  const lastFresh = targets
    .filter((target) => target.status === "fresh" && target.lastSyncedAt)
    .sort((a, b) => (b.lastSyncedAt ?? "").localeCompare(a.lastSyncedAt ?? ""))[0];
  return {
    status: targets.some((target) => target.status === "fresh") ? "fresh" : "stale",
    message: lastFresh
      ? `Generated files were refreshed for ${lastFresh.target} at ${lastFresh.lastSyncedAt}.`
      : "Generated sync state exists, but the last recorded repair did not pass.",
    refreshCommand: "akan sync <app-or-lib>",
    verifyingCommands: ["akan lint <app-or-lib-or-pkg>", "akan build <app-name>"],
    targets,
  };
};

const parseAbstractSummary = (
  relativePath: string,
  content: string | null,
  includeContent: boolean,
): AkanAbstractSummary => {
  if (content === null) return { path: relativePath, exists: false, headings: [] };
  const headings = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("#"))
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return {
    path: relativePath,
    exists: true,
    title: headings[0],
    headings: headings.slice(0, 8),
    ...(includeContent ? { content } : {}),
  };
};

const readFiles = async (dirPath: string) =>
  (await safeReadDir(dirPath))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

const getRelative = (workspace: WorkspaceExecutor, absolutePath: string) =>
  path.relative(workspace.workspaceRoot, absolutePath).replaceAll(path.sep, "/");

const createModuleContext = async (
  workspace: WorkspaceExecutor,
  sys: SysExecutor,
  kind: AkanModuleKind,
  folderName: string,
  moduleName: string,
  includeAbstractContent: boolean,
): Promise<AkanModuleContext> => {
  const modulePath =
    kind === "scalar"
      ? path.join(sys.cwdPath, "lib", "__scalar", moduleName)
      : path.join(sys.cwdPath, "lib", folderName);
  const relativePath = getRelative(workspace, modulePath);
  const abstractPath = `${relativePath}/${moduleName}.abstract.md`;
  const abstractContent = await safeReadText(path.join(workspace.workspaceRoot, abstractPath));
  return {
    kind,
    name: moduleName,
    folderName,
    sysName: sys.name,
    sysType: sys.type,
    path: relativePath,
    abstract: parseAbstractSummary(abstractPath, abstractContent, includeAbstractContent),
    files: await readFiles(modulePath),
  };
};

const getSysModules = async (
  workspace: WorkspaceExecutor,
  sys: SysExecutor,
  {
    includeAbstractContent = false,
    module: moduleFilter,
  }: { includeAbstractContent?: boolean; module?: string | null } = {},
) => {
  const libPath = path.join(sys.cwdPath, "lib");
  const entries = await safeReadDir(libPath);
  const modules: AkanModuleContext[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "__scalar") continue;
    if (entry.name.startsWith("__")) continue;
    if (entry.name.startsWith("_")) {
      const serviceName = entry.name.replace(/^_+/, "");
      if (moduleFilter && moduleFilter !== serviceName && moduleFilter !== entry.name) continue;
      if (!(await FileSys.fileExists(path.join(libPath, entry.name, `${serviceName}.service.ts`)))) continue;
      modules.push(
        await createModuleContext(workspace, sys, "service", entry.name, serviceName, includeAbstractContent),
      );
    } else {
      if (moduleFilter && moduleFilter !== entry.name) continue;
      if (!(await FileSys.fileExists(path.join(libPath, entry.name, `${entry.name}.constant.ts`)))) continue;
      modules.push(await createModuleContext(workspace, sys, "domain", entry.name, entry.name, includeAbstractContent));
    }
  }

  const scalarRoot = path.join(libPath, "__scalar");
  for (const entry of await safeReadDir(scalarRoot)) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    if (moduleFilter && moduleFilter !== entry.name) continue;
    if (!(await FileSys.fileExists(path.join(scalarRoot, entry.name, `${entry.name}.constant.ts`)))) continue;
    modules.push(await createModuleContext(workspace, sys, "scalar", entry.name, entry.name, includeAbstractContent));
  }

  return modules.sort((a, b) => `${a.sysName}:${a.path}`.localeCompare(`${b.sysName}:${b.path}`));
};

const getSysContext = async (
  workspace: WorkspaceExecutor,
  type: "app" | "lib",
  name: string,
  options: AkanContextOptions,
): Promise<AkanSysContext> => {
  const sys = type === "app" ? AppExecutor.from(workspace, name) : LibExecutor.from(workspace, name);
  return {
    type,
    name,
    path: `${type}s/${name}`,
    hasConfig: await FileSys.fileExists(path.join(sys.cwdPath, "akan.config.ts")),
    modules: await getSysModules(workspace, sys, {
      includeAbstractContent: options.includeAbstractContent,
      module: options.module,
    }),
  };
};

export class AkanContextAnalyzer {
  static async analyze(workspace: WorkspaceExecutor, options: AkanContextOptions = {}): Promise<AkanWorkspaceContext> {
    const [appNames, libNames, pkgNames] = await workspace.getExecs();
    const rootPackageJson = await safeReadJson<PackageJson>(path.join(workspace.workspaceRoot, "package.json"));
    const filteredApps = options.app ? appNames.filter((name) => name === options.app) : appNames;
    const [apps, libs, pkgs] = await Promise.all([
      Promise.all(filteredApps.map((name) => getSysContext(workspace, "app", name, options))),
      Promise.all(libNames.map((name) => getSysContext(workspace, "lib", name, options))),
      Promise.all(
        pkgNames.map(async (name) => {
          const packageJson = await safeReadJson<PackageJson>(
            path.join(workspace.workspaceRoot, "pkgs", name, "package.json"),
          );
          return {
            name,
            path: `pkgs/${name}`,
            ...(packageJson?.version ? { version: packageJson.version } : {}),
          };
        }),
      ),
    ]);

    return {
      schemaVersion: 1,
      repoName: workspace.repoName,
      root: workspace.workspaceRoot,
      packageVersion: rootPackageJson?.dependencies?.akanjs ?? rootPackageJson?.devDependencies?.["@akanjs/devkit"],
      apps,
      libs,
      pkgs,
      generatedFiles,
      validationCommands,
    };
  }

  static async doctor(
    workspace: WorkspaceExecutor,
    {
      strict = false,
      runIdOrPlan = null,
      changedFiles = [],
    }: { strict?: boolean; runIdOrPlan?: string | null; changedFiles?: string[] } = {},
  ): Promise<AkanDoctorResult> {
    const context = await AkanContextAnalyzer.analyze(workspace);
    const workflowPaths = await loadWorkflowContextPaths(workspace, runIdOrPlan, changedFiles);
    const diagnostics: AkanDiagnostic[] = [];
    const repairActions: RepairAction[] = [
      repairAction("generated", "akan repair generated --app <app-or-lib>", "Refresh generated Akan files.", true),
      repairAction(
        "format",
        "akan repair format --target <app-or-lib-or-pkg>",
        "Run the formatter/linter repair path.",
        true,
      ),
    ];

    for (const app of context.apps) {
      const appPath = path.join(workspace.workspaceRoot, app.path);
      for (const entry of await safeReadDir(appPath)) {
        const allowed = entry.isDirectory() ? appRootAllowDirs.has(entry.name) : appRootAllowFiles.has(entry.name);
        if (!allowed) {
          const action = repairAction(
            "module-shape",
            `akan repair module-shape --app ${app.name}`,
            "Review app root shape and remove or move the unknown entry.",
            false,
          );
          diagnostics.push({
            severity: "error",
            code: "app-root-unknown-entry",
            path: `${app.path}/${entry.name}`,
            message: `Unexpected ${entry.isDirectory() ? "folder" : "file"} in app root: ${app.path}/${entry.name}`,
            repairActions: [action],
          });
          repairActions.push(action);
        }
      }
    }

    for (const sys of [...context.apps, ...context.libs]) {
      for (const module of sys.modules) {
        if (!module.abstract.exists) {
          const action = repairAction(
            "module-shape",
            `akan repair module-shape --app ${sys.name} --module ${module.name}`,
            "Create the missing module abstract or inspect required source files.",
            false,
          );
          diagnostics.push({
            severity: strict ? "error" : "warning",
            code: "module-abstract-missing",
            path: module.abstract.path,
            message: `${capitalize(module.kind)} module ${sys.name}:${module.name} should include ${module.abstract.path}`,
            repairActions: [action],
          });
          repairActions.push(action);
        }
        const missingFiles = moduleShapeFiles(module).filter((filename) => !module.files.includes(filename));
        if (missingFiles.length) {
          const action = repairAction(
            "module-shape",
            `akan repair module-shape --app ${sys.name} --module ${module.name}`,
            "Review missing required module source files.",
            false,
          );
          diagnostics.push({
            severity: "error",
            code: "module-shape-invalid",
            path: module.path,
            message: `${capitalize(module.kind)} module ${sys.name}:${module.name} is missing required files: ${missingFiles.join(", ")}`,
            repairActions: [action],
          });
          repairActions.push(action);
        }
        if (module.kind !== "service" && module.files.includes(`${module.name}.dictionary.ts`)) {
          const constantPath = path.join(workspace.workspaceRoot, module.path, `${module.name}.constant.ts`);
          const dictionaryPath = path.join(workspace.workspaceRoot, module.path, `${module.name}.dictionary.ts`);
          const [constantContent, dictionaryContent] = await Promise.all([
            safeReadText(constantPath),
            safeReadText(dictionaryPath),
          ]);
          if (constantContent && dictionaryContent) {
            for (const fieldName of constantFieldNames(constantContent)) {
              if (new RegExp(`\\b${fieldName}\\s*:`).test(dictionaryContent)) continue;
              const action = repairAction(
                "dictionary",
                `akan repair dictionary --app ${sys.name} --module ${module.name}`,
                "Add missing dictionary labels for source constant fields.",
                false,
              );
              diagnostics.push({
                severity: "warning",
                code: "dictionary-label-missing",
                path: `${module.path}/${module.name}.dictionary.ts`,
                message: `Dictionary labels for ${sys.name}:${module.name}.${fieldName} were not found.`,
                repairActions: [action],
              });
              repairActions.push(action);
            }
          }
        }
      }
    }

    const scopedDiagnostics = diagnostics.map((diagnostic) => ({
      ...diagnostic,
      scope: workflowPaths.length
        ? isWorkflowRelatedDiagnostic(diagnostic, workflowPaths)
          ? ("workflow" as const)
          : ("baseline" as const)
        : diagnostic.scope,
      context: workflowPaths.length ? { ...diagnostic.context, paths: workflowPaths } : diagnostic.context,
    }));
    const workflowDiagnostics = scopedDiagnostics.filter((diagnostic) => diagnostic.scope === "workflow");
    const baselineDiagnostics = scopedDiagnostics.filter((diagnostic) => diagnostic.scope === "baseline");
    return {
      schemaVersion: 1,
      repoName: context.repoName,
      root: context.root,
      strict,
      status: scopedDiagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "passed",
      diagnostics: scopedDiagnostics,
      generatedFiles: context.generatedFiles,
      generatedFilesFreshness: await generatedFreshnessFromStates(workspace),
      validationCommands: context.validationCommands,
      repairActions,
      ...(workflowPaths.length ? { baselineDiagnostics, workflowDiagnostics } : {}),
    };
  }

  static findModules(
    context: AkanWorkspaceContext,
    moduleName?: string | null,
    { app = null }: { app?: string | null } = {},
  ) {
    const modules = [...context.apps, ...context.libs]
      .filter((sys) => !app || sys.name === app)
      .flatMap((sys) => sys.modules);
    return moduleName
      ? modules.filter((module) => module.name === moduleName || module.folderName === moduleName)
      : modules;
  }

  static renderMarkdown(context: AkanWorkspaceContext, { module: moduleName }: { module?: string | null } = {}) {
    const lines = [`# Akan Workspace Context`, "", `- Repo: ${context.repoName}`, `- Root: ${context.root}`];
    if (context.packageVersion) lines.push(`- Akan version: ${context.packageVersion}`);
    lines.push("", "## Apps", ...context.apps.map((app) => `- ${app.name}: ${app.modules.length} module(s)`));
    lines.push("", "## Libraries", ...context.libs.map((lib) => `- ${lib.name}: ${lib.modules.length} module(s)`));
    lines.push(
      "",
      "## Packages",
      ...context.pkgs.map((pkg) => `- ${pkg.name}${pkg.version ? ` (${pkg.version})` : ""}`),
    );

    const modules = AkanContextAnalyzer.findModules(context, moduleName);
    lines.push("", "## Modules");
    for (const module of modules) {
      lines.push("", `### ${module.sysName}:${module.name} (${module.kind})`, `- Path: ${module.path}`);
      lines.push(`- Abstract: ${module.abstract.exists ? module.abstract.path : "missing"}`);
      if (module.abstract.exists && module.abstract.content) lines.push("", module.abstract.content.trim(), "");
      else if (module.abstract.headings.length)
        lines.push(`- Abstract headings: ${module.abstract.headings.join(", ")}`);
      lines.push(`- Files: ${module.files.join(", ") || "none"}`);
    }

    lines.push("", "## Validation", ...context.validationCommands.map((command) => `- \`${command}\``));
    return `${lines.join("\n")}\n`;
  }
}
