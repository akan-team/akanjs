import path from "node:path";
import { parseRouteModuleKey } from "akanjs/common";
import { AppExecutor, LibExecutor, type SysExecutor, type WorkspaceExecutor } from "../executors";
import { FileSys } from "../util/fileSys";
import type { RepairAction } from "../workflow";
import type { PackageJson } from "../workspace/types";
import { AgentGuideCheck } from "./doctor/agentGuideCheck";
import { ConfigLeftoverCheck } from "./doctor/configLeftoverCheck";
import { DoctorFindings } from "./doctor/doctorFindings";
import { ModuleShapeCheck } from "./doctor/moduleShapeCheck";
import { RecipeDuplicateCheck } from "./doctor/recipeDuplicateCheck";
import { RecipeIndexCheck } from "./doctor/recipeIndexCheck";
import { RootShapeCheck } from "./doctor/rootShapeCheck";
import { loadWorkflowContextPaths } from "./doctor/workflowScope";
import { safeReadDir, safeReadJson, safeReadText } from "./safeRead";

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

export interface AkanRouteContext {
  /** The URL pattern without the `/:lang` segment every route starts with. */
  path: string;
  file: string;
  search: string[];
  /** The page or a layout above it calls `.guard()`. */
  guarded: boolean;
  devOnly: boolean;
}

export interface AkanSysContext {
  type: "app" | "lib";
  name: string;
  path: string;
  hasConfig: boolean;
  modules: AkanModuleContext[];
  /** Listed for the app `--app` names only; reading them parses every route file. */
  routes?: AkanRouteContext[];
  routeError?: string;
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

// Cursor and Claude Code read a JSON `mcpServers` map; Codex reads a TOML `[mcp_servers.<name>]` table.
export type AkanMcpInstallTarget = "cursor" | "claude" | "codex";

export type CursorMcpConfig = {
  mcpServers?: Record<string, unknown>;
};

export const guidelineResourceUri = (name: string) => `akan://guidelines/${name}`;

const staticResourceList = [
  { uri: "akan://docs/framework", name: "Akan framework guide", mimeType: "text/markdown" },
  { uri: "akan://workspace/summary", name: "Workspace summary", mimeType: "application/json" },
  { uri: "akan://workspace/apps", name: "Workspace apps", mimeType: "application/json" },
  { uri: "akan://workspace/modules", name: "Workspace modules", mimeType: "application/json" },
];

export const buildResourceList = (guidelineNames: readonly string[]) => [
  ...staticResourceList,
  ...guidelineNames.map((name) => ({
    uri: guidelineResourceUri(name),
    name: `${name} guideline`,
    mimeType: "text/markdown",
  })),
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

// `akan mcp` resolves the workspace from its cwd: Cursor expands ${workspaceFolder}, Claude Code only sets
// CLAUDE_PROJECT_DIR (its cwd is not guaranteed), and Codex runs from its own launch cwd.
const cursorWorkspaceFolder = "$" + "{workspaceFolder}";
const claudeProjectDir = "$CLAUDE_PROJECT_DIR";

const akanMcpCommand = (mode: AkanMcpMode, { cd }: { cd?: string } = {}) =>
  cd ? `cd "${cd}" && akan mcp --mode ${mode}` : `akan mcp --mode ${mode}`;

const bashMcpServer = (mode: AkanMcpMode, cd: string) => ({
  type: "stdio",
  command: "bash",
  args: ["-lc", akanMcpCommand(mode, { cd })],
});

export const createAkanCursorMcpServer = (mode: AkanMcpMode = "readonly") => bashMcpServer(mode, cursorWorkspaceFolder);

export const createAkanClaudeMcpServer = (mode: AkanMcpMode = "readonly") => bashMcpServer(mode, claudeProjectDir);

export const createAkanMcpServer = (target: "cursor" | "claude", mode: AkanMcpMode = "readonly") =>
  target === "cursor" ? createAkanCursorMcpServer(mode) : createAkanClaudeMcpServer(mode);

export const akanCursorMcpServer = createAkanCursorMcpServer();

// No TOML serializer is bundled, so the `[mcp_servers.akan]` table is written as text.
export const codexMcpServerTableHeader = "[mcp_servers.akan]";
export const createAkanCodexMcpServerBlock = (mode: AkanMcpMode = "readonly") =>
  `${codexMcpServerTableHeader}\ncommand = "bash"\nargs = ["-lc", "${akanMcpCommand(mode)}"]\n`;

// A TOML table runs from its header until the next top-level `[header]` or EOF.
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
    return `${existing.trimEnd()}\n\n${nextBlock}`;
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
  "akan verify [<app-or-lib-or-pkg>]",
  "akan sync <app-or-lib>",
  "akan lint <app-or-lib-or-pkg>",
  "akan typecheck <app-or-lib>",
  "akan test <app-or-lib-or-pkg>",
  "akan build <app-name>",
  "akan doctor --strict --format json",
  "akan quality scan [--format json]",
  "akan quality ssr [--format json]",
];

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

const getAppRoutes = async (app: AppExecutor, workspaceRoot: string): Promise<AkanRouteContext[]> => {
  const sources = await app.getRouteSources();
  const guardedLayouts = new Set<string>();
  const pages: { source: (typeof sources)[number]; parsed: ReturnType<typeof parseRouteModuleKey> }[] = [];
  for (const source of sources) {
    const parsed = parseRouteModuleKey(source.key);
    if (parsed.kind === "layout" && source.info.chain?.guarded) guardedLayouts.add(parsed.routeSegments.join("/"));
    else if (parsed.kind === "page") pages.push({ source, parsed });
  }
  return pages
    .map(({ source, parsed }) => {
      const segments = parsed.routeSegments;
      //? The layouts that wrap a page, as the route seed index walks them: an `_index` sits inside its own folder.
      const reach = parsed.leaf === "_index" ? segments.length : segments.length - 1;
      const underGuard = Array.from({ length: reach + 1 }, (_, idx) => segments.slice(0, idx).join("/")).some(
        (prefix) => guardedLayouts.has(prefix),
      );
      return {
        path: parsed.pattern.replace(/^\/:lang/, "") || "/",
        file: path.relative(workspaceRoot, source.absPath).replaceAll(path.sep, "/"),
        search: source.info.chain?.search ?? [],
        guarded: !!source.info.chain?.guarded || underGuard,
        devOnly: source.info.devOnly,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
};

const getSysContext = async (
  workspace: WorkspaceExecutor,
  type: "app" | "lib",
  name: string,
  options: AkanContextOptions,
): Promise<AkanSysContext> => {
  const sys = type === "app" ? AppExecutor.from(workspace, name) : LibExecutor.from(workspace, name);
  const context: AkanSysContext = {
    type,
    name,
    path: `${type}s/${name}`,
    hasConfig: await FileSys.fileExists(path.join(sys.cwdPath, "akan.config.ts")),
    modules: await getSysModules(workspace, sys, {
      includeAbstractContent: options.includeAbstractContent,
      module: options.module,
    }),
  };
  if (sys instanceof AppExecutor && options.app === name)
    await getAppRoutes(sys, workspace.workspaceRoot).then(
      (routes) => (context.routes = routes),
      (error: unknown) => (context.routeError = error instanceof Error ? error.message : String(error)),
    );
  return context;
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
    const systems = [...context.apps, ...context.libs];
    const findings = new DoctorFindings();
    await RootShapeCheck.run(workspace, systems, findings);
    await AgentGuideCheck.run(workspace, systems, findings);
    await ConfigLeftoverCheck.run(workspace, systems, findings);
    await ModuleShapeCheck.run(workspace, systems, findings, { strict });
    await RecipeDuplicateCheck.run(workspace, systems, findings);
    await RecipeIndexCheck.run(workspace, systems, findings);
    return await findings.result(workspace, context, { strict, workflowPaths });
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

    for (const app of context.apps) {
      if (app.routeError) lines.push("", `## Routes: ${app.name}`, `- Not read: ${app.routeError}`);
      else if (app.routes)
        lines.push("", `## Routes: ${app.name}`, ...AkanContextAnalyzer.#routeLines(app.name, app.routes));
    }

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

  static readonly routeListLimit = 60;

  //? Past the limit the biggest top folders fold into one line each: a docs section alone would fill the context.
  static #routeLines(appName: string, routes: AkanRouteContext[]) {
    const folderOf = (route: AkanRouteContext) => route.file.split("/").slice(0, 4).join("/");
    const groups = Map.groupBy(routes, folderOf);
    const folded = new Set<string>();
    let listed = routes.length;
    for (const [folder, members] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      if (listed <= AkanContextAnalyzer.routeListLimit) break;
      folded.add(folder);
      listed -= members.length;
    }
    const lines = [`Paths omit the \`/:lang\` prefix; \`akan preview ${appName} <path>\` opens one.`];
    for (const route of routes) {
      if (folded.has(folderOf(route))) continue;
      const search = route.search.length ? ` ?${route.search.join("&")}` : "";
      const marks = `${route.guarded ? " (guarded)" : ""}${route.devOnly ? " (dev only)" : ""}`;
      lines.push(`- ${route.path}${search}${marks} — ${route.file}`);
    }
    for (const folder of folded) {
      const members = groups.get(folder) ?? [];
      const examples = members.slice(0, 3).map((route) => route.path);
      lines.push(
        `- ${folder}/: ${members.length} routes folded (${examples.join(", ")}, …); \`--format json\` lists every route`,
      );
    }
    return lines;
  }
}
