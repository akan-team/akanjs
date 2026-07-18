import {
  AkanContextAnalyzer,
  type AkanContextFormat,
  type AkanMcpInstallTarget,
  type AkanMcpMode,
  akanMcpInstallConfigPaths,
  applyFirstPolicy,
  type CursorMcpConfig,
  codexMcpConfigPath,
  createAkanCodexMcpServerBlock,
  createAkanMcpServer,
  createAkanValidationContract,
  createWorkflowBaselineSummary,
  defaultWorkflowPlanPath,
  inspectAkanContext,
  type JsonRpcRequest,
  jsonText,
  listAkanMcpTools,
  type McpFraming,
  Prompter,
  parseJsonOutput,
  renderDoctorText,
  resourceList,
  runner,
  stringArg,
  upsertCodexMcpServerBlock,
  type WorkflowDiagnostic,
  type Workspace,
  workflowInputsArg,
  workspacePath,
} from "@akanjs/devkit";
import { RepairRunner } from "../repair/repair.runner";
import { WorkflowRunner } from "../workflow/workflow.runner";
import { createCliWorkflowStepRegistry } from "./context.workflowRegistry";

const workflowDiagnosticFromContext = (diagnostic: {
  severity: "warning" | "error";
  code: string;
  message: string;
  scope?: "baseline" | "workflow" | "unknown";
  context?: WorkflowDiagnostic["context"];
}): WorkflowDiagnostic => ({
  severity: diagnostic.severity,
  code: diagnostic.code,
  message: diagnostic.message,
  scope: diagnostic.scope,
  context: diagnostic.context,
});

const compactDoctorWorkspaceResult = (
  result: Awaited<ReturnType<typeof AkanContextAnalyzer.doctor>>,
  includeBaselineDetails: boolean,
) => {
  const baselineDiagnostics = result.baselineDiagnostics ?? [];
  if (baselineDiagnostics.length === 0) {
    return {
      ...result,
      baselineSummary: createWorkflowBaselineSummary([], { detailsIncluded: includeBaselineDetails }),
    };
  }
  const baselineSummary = createWorkflowBaselineSummary(baselineDiagnostics.map(workflowDiagnosticFromContext), {
    detailsIncluded: includeBaselineDetails,
  });
  return {
    ...result,
    baselineSummary,
    diagnostics: includeBaselineDetails
      ? result.diagnostics
      : result.diagnostics.filter((diagnostic) => diagnostic.scope !== "baseline"),
    baselineDiagnostics: includeBaselineDetails ? baselineDiagnostics : [],
  };
};

export class ContextRunner extends runner("context") {
  async getContext(
    workspace: Workspace,
    {
      format = "markdown",
      app = null,
      module = null,
    }: { format?: AkanContextFormat; app?: string | null; module?: string | null } = {},
  ) {
    const context = await AkanContextAnalyzer.analyze(workspace, {
      app,
      module,
      includeAbstractContent: !!module,
    });
    return format === "json" ? jsonText(context) : AkanContextAnalyzer.renderMarkdown(context, { module });
  }

  async doctor(
    workspace: Workspace,
    { format = "text", strict = false }: { format?: "text" | "json"; strict?: boolean } = {},
  ) {
    const result = await AkanContextAnalyzer.doctor(workspace, { strict });
    return format === "json" ? jsonText(result) : renderDoctorText(result);
  }

  async getGuidelineResource(name: string) {
    return await Prompter.getInstruction(name);
  }

  async installMcp(
    workspace: Workspace,
    target: AkanMcpInstallTarget,
    { force = false, mode = "readonly" }: { force?: boolean; mode?: AkanMcpMode } = {},
  ) {
    if (target === "codex") return await this.#installCodexMcp(workspace, { force, mode });
    return await this.#installJsonMcp(workspace, target, { force, mode });
  }

  // Cursor (.cursor/mcp.json) and Claude Code (.mcp.json) share a JSON `mcpServers` map, so the merge
  // logic is identical: keep every existing server and upsert only the "akan" entry.
  async #installJsonMcp(
    workspace: Workspace,
    target: "cursor" | "claude",
    { force, mode }: { force: boolean; mode: AkanMcpMode },
  ) {
    const configPath = akanMcpInstallConfigPaths[target];
    const existing = (await workspace.exists(configPath))
      ? ((await workspace.readJson(configPath)) as CursorMcpConfig)
      : {};
    const mcpServers = existing.mcpServers ?? {};
    const currentAkanServer = mcpServers.akan;
    const nextAkanServer = createAkanMcpServer(target, mode);
    if (currentAkanServer && !force && JSON.stringify(currentAkanServer) !== JSON.stringify(nextAkanServer)) {
      throw new Error(`${configPath} already has an "akan" MCP server. Re-run with --force to overwrite it.`);
    }
    const nextConfig: CursorMcpConfig = {
      ...existing,
      mcpServers: {
        ...mcpServers,
        akan: nextAkanServer,
      },
    };
    await workspace.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
    return configPath;
  }

  // Codex (.codex/config.toml) is TOML; we upsert only the [mcp_servers.akan] table as text.
  async #installCodexMcp(workspace: Workspace, { force, mode }: { force: boolean; mode: AkanMcpMode }) {
    const existing = (await workspace.exists(codexMcpConfigPath)) ? await workspace.readFile(codexMcpConfigPath) : "";
    const merged = upsertCodexMcpServerBlock(existing, createAkanCodexMcpServerBlock(mode), { force });
    await workspace.writeFile(codexMcpConfigPath, merged);
    return codexMcpConfigPath;
  }

  listMcpTools(mode: AkanMcpMode = "readonly") {
    return listAkanMcpTools(mode);
  }

  async callMcpTool(
    workspace: Workspace,
    name: string,
    args: Record<string, unknown> = {},
    { mode = "readonly" }: { mode?: AkanMcpMode } = {},
  ) {
    const availableTools = this.listMcpTools(mode);
    if (!availableTools.some((tool) => tool.name === name)) {
      throw new Error(`MCP tool "${name}" is not available in ${mode} mode.`);
    }

    if (name === "inspect_akan_context") return await inspectAkanContext(workspace, args);

    if (
      name === "get_workspace_summary" ||
      name === "list_apps" ||
      name === "list_modules" ||
      name === "get_module_context"
    ) {
      const context = await AkanContextAnalyzer.analyze(workspace, {
        app: (args.app as string | undefined) ?? null,
        module: (args.module as string | undefined) ?? null,
        includeAbstractContent: name === "get_module_context",
      });
      if (name === "get_workspace_summary") return context;
      if (name === "list_apps") return context.apps;
      if (name === "list_modules") return AkanContextAnalyzer.findModules(context);
      const modules = AkanContextAnalyzer.findModules(context, args.module as string | undefined, {
        app: (args.app as string | undefined) ?? null,
      });
      if (name === "get_module_context" && !args.app && modules.length > 1) {
        return {
          diagnostics: [
            {
              severity: "error",
              code: "module-context-ambiguous",
              message: `Multiple modules match "${args.module}". Re-run get_module_context with an app argument.`,
              input: "app",
            },
          ],
          candidates: modules.map((module) => ({
            app: module.sysName,
            sysType: module.sysType,
            module: module.name,
            path: module.path,
          })),
        };
      }
      return modules;
    }

    if (name === "get_guideline") return await Prompter.getInstruction(stringArg(args, "name"));
    if (name === "doctor_workspace")
      return compactDoctorWorkspaceResult(
        await AkanContextAnalyzer.doctor(workspace, {
          strict: !!args.strict,
          runIdOrPlan: typeof args.runIdOrPlan === "string" ? workspacePath(workspace, args.runIdOrPlan) : null,
          changedFiles: Array.isArray(args.changedFiles)
            ? args.changedFiles.filter((file): file is string => typeof file === "string")
            : [],
        }),
        !!args.includeBaselineDetails,
      );
    if (name === "explain_command") return this.explainCommand(stringArg(args, "command"));
    if (name === "get_validation_contract") return createAkanValidationContract((mode) => this.listMcpTools(mode));

    if (name === "list_workflows") return parseJsonOutput(new WorkflowRunner().list({ format: "json" }));
    if (name === "explain_workflow")
      return parseJsonOutput(new WorkflowRunner().explain(stringArg(args, "workflow"), { format: "json" }));
    if (name === "plan_workflow") {
      const workflow = stringArg(args, "workflow");
      const inputs = workflowInputsArg(args);
      const planPath = typeof args.out === "string" && args.out ? args.out : defaultWorkflowPlanPath(workflow, inputs);
      const plan = parseJsonOutput(
        await new WorkflowRunner().plan(workflow, inputs, {
          format: "json",
          out: workspacePath(workspace, planPath),
        }),
      );
      return {
        ...(plan as Record<string, unknown>),
        planPath,
        approval:
          typeof plan === "object" && plan && "approval" in plan
            ? { ...(plan.approval as Record<string, unknown>), canApplyWith: { planPath } }
            : undefined,
        next: { tool: "apply_workflow", args: { planPath } },
        policy: applyFirstPolicy,
      };
    }
    if (name === "apply_workflow") {
      const report = parseJsonOutput(
        await new WorkflowRunner().apply(workspacePath(workspace, stringArg(args, "planPath")), {
          format: "json",
          dryRun: !!args.dryRun,
          workspace,
          registry: createCliWorkflowStepRegistry(workspace),
        }),
      ) as Record<string, unknown>;
      const validationTarget =
        typeof report.validationTarget === "string"
          ? report.validationTarget
          : typeof report.applyReportPath === "string"
            ? report.applyReportPath
            : stringArg(args, "planPath");
      return {
        ...report,
        validationTarget,
        next: { tool: "run_validation", args: { runIdOrPlan: validationTarget } },
        policy: applyFirstPolicy,
      };
    }
    if (name === "run_validation")
      return parseJsonOutput(
        await new WorkflowRunner().validate(workspacePath(workspace, stringArg(args, "runIdOrPlan")), {
          format: "json",
          workspace,
          includeBaselineDetails: !!args.includeBaselineDetails,
        }),
      );
    if (name === "repair_generated") {
      const report = parseJsonOutput(
        await new RepairRunner().repair("generated", { workspace, app: stringArg(args, "app"), format: "json" }),
      ) as Record<string, unknown>;
      return { ...report, next: { tool: "doctor_workspace", args: { strict: true } } };
    }
    if (name === "repair_imports")
      return parseJsonOutput(
        await new RepairRunner().repair("imports", {
          workspace,
          target: stringArg(args, "target"),
          format: "json",
        }),
      );
    if (name === "repair_module_shape")
      return parseJsonOutput(
        await new RepairRunner().repair("module-shape", {
          workspace,
          app: stringArg(args, "app"),
          module: stringArg(args, "module"),
          format: "json",
        }),
      );

    throw new Error(`Unknown tool: ${name}`);
  }

  async runMcp(workspace: Workspace, { mode = "readonly" }: { mode?: AkanMcpMode } = {}) {
    const decoder = new TextDecoder();
    let buffer = "";
    const writeMessage = (message: unknown, framing: McpFraming) => {
      const payload = JSON.stringify(message);
      if (framing === "newline") process.stdout.write(`${payload}\n`);
      else process.stdout.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
    };
    const respond = (id: JsonRpcRequest["id"], result: unknown, framing: McpFraming) => {
      writeMessage({ jsonrpc: "2.0", id, result }, framing);
    };
    const respondError = (id: JsonRpcRequest["id"], code: number, message: string, framing: McpFraming) => {
      writeMessage({ jsonrpc: "2.0", id, error: { code, message } }, framing);
    };
    const readResource = async (uri: string) => {
      const context = await AkanContextAnalyzer.analyze(workspace);
      if (uri === "akan://docs/framework" || uri === "akan://guidelines/framework")
        return { uri, mimeType: "text/markdown", text: await Prompter.getInstruction("framework") };
      if (uri === "akan://guidelines/modelSignal")
        return { uri, mimeType: "text/markdown", text: await Prompter.getInstruction("modelSignal") };
      if (uri === "akan://workspace/summary")
        return { uri, mimeType: "application/json", text: jsonText(context, { trailingNewline: false }) };
      if (uri === "akan://workspace/apps")
        return { uri, mimeType: "application/json", text: jsonText(context.apps, { trailingNewline: false }) };
      if (uri === "akan://workspace/modules")
        return {
          uri,
          mimeType: "application/json",
          text: jsonText(AkanContextAnalyzer.findModules(context), { trailingNewline: false }),
        };
      const abstractMatch = uri.match(/^akan:\/\/workspace\/modules\/(.+)\/abstract$/);
      if (abstractMatch) {
        const detailed = await AkanContextAnalyzer.analyze(workspace, {
          module: abstractMatch[1],
          includeAbstractContent: true,
        });
        const abstract = AkanContextAnalyzer.findModules(detailed, abstractMatch[1])[0]?.abstract;
        return { uri, mimeType: "text/markdown", text: abstract?.content ?? "" };
      }
      throw new Error(`Unknown resource: ${uri}`);
    };
    const handle = async (request: JsonRpcRequest, framing: McpFraming) => {
      const params = request.params ?? {};
      if (request.method === "initialize") {
        respond(
          request.id,
          {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "akan", version: process.env.AKAN_VERSION ?? "0.0.0" },
          },
          framing,
        );
      } else if (request.method === "tools/list") {
        respond(
          request.id,
          {
            tools: this.listMcpTools(mode),
          },
          framing,
        );
      } else if (request.method === "tools/call") {
        const name = params.name as string;
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          const result = await this.callMcpTool(workspace, name, args, { mode });
          respond(
            request.id,
            {
              content: [
                {
                  type: "text",
                  text: typeof result === "string" ? result : jsonText(result, { trailingNewline: false }),
                },
              ],
            },
            framing,
          );
        } catch (error) {
          respondError(request.id, -32602, error instanceof Error ? error.message : String(error), framing);
        }
      } else if (request.method === "resources/list") {
        respond(request.id, { resources: resourceList }, framing);
      } else if (request.method === "resources/read") {
        respond(request.id, { contents: [await readResource(params.uri as string)] }, framing);
      } else if (!request.method.endsWith("/initialized")) {
        respondError(request.id, -32601, `Unknown method: ${request.method}`, framing);
      }
    };
    const parseContentLengthMessage = async () => {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return false;
      const header = buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        return true;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return false;
      const body = buffer.slice(bodyStart, bodyEnd);
      buffer = buffer.slice(bodyEnd);
      await handle(JSON.parse(body) as JsonRpcRequest, "content-length");
      return true;
    };
    const parseLineMessage = async () => {
      const lineEnd = buffer.indexOf("\n");
      if (lineEnd < 0) return false;
      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);
      if (!line) return true;
      await handle(JSON.parse(line) as JsonRpcRequest, "newline");
      return true;
    };
    const parse = async () => {
      for (;;) {
        buffer = buffer.trimStart();
        if (/^Content-Length:/i.test(buffer)) {
          if (await parseContentLengthMessage()) continue;
          return;
        }
        if (buffer.includes("\r\n\r\n") && (await parseContentLengthMessage())) continue;
        if (await parseLineMessage()) continue;
        return;
      }
    };
    for await (const chunk of Bun.stdin.stream()) {
      buffer += decoder.decode(chunk);
      await parse();
    }
  }

  explainCommand(command: string) {
    const explanations: Record<string, string> = {
      context: "`akan context` prints agent-readable workspace, app, module, and abstract metadata.",
      "create-module": "`akan create-module <name> --app <app>` scaffolds a database-backed domain module.",
      "create-scalar": "`akan create-scalar <name> --app <app>` scaffolds a reusable scalar value module.",
      "create-service": "`akan create-service <name> --app <app>` scaffolds a non-database service module.",
      "create-view": "`akan create-view --app <app> --module <module>` creates a module View component.",
      "create-unit": "`akan create-unit --app <app> --module <module>` creates a module Unit component.",
      "create-template": "`akan create-template --app <app> --module <module>` creates a module Template component.",
      "create-ui":
        "`akan create-ui --app <app-or-lib> --module <module> --surface <view|unit|template> --format json` creates one UI surface and returns a primitive write report.",
      "add-field":
        "`akan add-field --app <app-or-lib> --module <module> --field <field> --type <String|Boolean|Date|Int|Float|scalar> --format json` updates source constant/dictionary files. Use Int or Float for numeric fields, not Number.",
      "add-enum-field":
        "`akan add-enum-field --app <app-or-lib> --module <module> --field <field> --values a,b --format json` adds an enum field to source constant/dictionary files without editing generated files.",
      sync: "`akan sync <app-or-lib>` refreshes generated Akan files from source conventions.",
      lint: "`akan lint <app-or-lib-or-pkg>` runs Biome linting after preparing generated files.",
      typecheck: "`akan typecheck <app-name>` runs an application typecheck after preparing generated files.",
      test: "`akan test <app-or-lib-or-pkg>` prepares the target and runs its tests.",
      build: "`akan build <app-name>` creates a production build after preparing generated files.",
      doctor:
        "`akan doctor --strict --format json` reports agent-readable workspace convention diagnostics and validation hints.",
      "guideline show": "`akan guideline show <name>` prints an Akan codegen guideline instruction.",
      workflow:
        "`akan workflow list|explain|plan|apply|validate|report` lists, plans, applies, validates, and reports agent-readable Akan workflows.",
      "workflow list": "`akan workflow list` lists parseable read-only workflow specs.",
      "workflow explain":
        "`akan workflow explain <workflow>` explains inputs, optional surfaces, steps, and validation.",
      "workflow plan":
        "`akan workflow plan <workflow> ... --out .akan/workflows/plans/<name>.json --format json` returns a read-only plan and can store a local plan artifact.",
      "workflow apply":
        "`akan workflow apply [--dry-run] <plan-path> --format json` reads an approved plan artifact and returns a workflow apply report.",
      "workflow validate":
        "`akan workflow validate <run-id-or-plan> --format json` runs validation commands from a plan or apply report and stores a structured run report.",
      "workflow report":
        "`akan workflow report <run-id> --format json` reads .akan/workflows/runs/<run-id>.json and prints the stored report.",
      repair:
        "`akan repair generated|format|imports|dictionary|module-shape --format json` runs narrow safe repairs or returns repair-oriented next actions.",
      "repair generated": "`akan repair generated --app <app-or-lib> --format json` refreshes generated Akan files.",
      "repair format":
        "`akan repair format --target <app-or-lib-or-pkg> --format json` runs the lint/format repair path.",
      "repair imports":
        "`akan repair imports --target <app-or-lib-or-pkg> --format json` runs the import organization repair path.",
      "repair dictionary":
        "`akan repair dictionary --app <app-or-lib> --module <module> --format json` reports dictionary label repair candidates.",
      "repair module-shape":
        "`akan repair module-shape --app <app-or-lib> --module <module> --format json` reports missing module source files and source-safe next actions.",
      agent: "`akan agent install <target>` writes editor-specific agent rules with overwrite protection.",
      mcp: "`akan mcp --mode readonly|plan|apply` starts the Akan MCP server over stdio with an explicit permission mode.",
      "mcp-call":
        '`akan mcp-call <tool> --mode plan --args \'{"workflow":"add-field","inputs":{"app":"demo"}}\'` calls one MCP tool through the same runner path for debugging.',
      "mcp-install":
        "`akan mcp-install [cursor|claude|codex|all] --mode readonly|plan|apply` installs the Akan MCP server config for Cursor (.cursor/mcp.json), Claude Code (.mcp.json), and Codex (.codex/config.toml). Defaults to all targets.",
    };
    return (
      explanations[command] ??
      `No detailed explanation is available for ${command}. Run \`akan --help\` for command help.`
    );
  }
}
