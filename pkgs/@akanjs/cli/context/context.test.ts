import { afterEach, describe, expect, test } from "bun:test";
import {
  AkanContextAnalyzer,
  createAkanClaudeMcpServer,
  createAkanCodexMcpServerBlock,
  createAkanCursorMcpServer,
} from "@akanjs/devkit/akanContext";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, ModuleExecutor } from "@akanjs/devkit/executors";
import { AgentRunner } from "../agent/agent.runner";
import { ModuleRunner } from "../module/module.runner";
import { cleanupCliTempWorkspace, createTempApp, createTempModule, writeJson, writeText } from "../testHelpers";
import { ContextRunner } from "./context.runner";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("ContextRunner", () => {
  test("prints module context with abstract content before module files", async () => {
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);

    const output = await new ContextRunner().getContext(workspace, { module: "post" });

    expect(output).toContain("# Post Module Abstract");
    expect(output.indexOf("# Post Module Abstract")).toBeLessThan(output.indexOf("- Files:"));
  });

  test("prints generated file and validation contracts in json context", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    const output = await new ContextRunner().getContext(workspace, { format: "json" });
    const context = JSON.parse(output) as Awaited<ReturnType<typeof AkanContextAnalyzer.analyze>>;

    expect(context.generatedFiles).not.toContain("*/lib/option.ts");
    expect(context.generatedFiles).toContain("*/ui/index.ts");
    expect(context.validationCommands).toContain("akan sync <app-or-lib>");
    expect(context.validationCommands).toContain("akan doctor --strict --format json");
    expect(context.validationCommands.join("\n")).not.toContain("akan scan");
  });

  test("reports missing abstract as warning by default and error in strict mode", async () => {
    const { root, workspace, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${app.cwdPath}/lib/post/post.constant.ts`, "export class Post {}\n");

    const loose = await AkanContextAnalyzer.doctor(workspace);
    const strict = await AkanContextAnalyzer.doctor(workspace, { strict: true });

    expect(loose.diagnostics[0]).toMatchObject({ code: "module-abstract-missing", severity: "warning" });
    expect(strict.diagnostics[0]).toMatchObject({ code: "module-abstract-missing", severity: "error" });
    expect(strict.status).toBe("failed");
    expect(strict.generatedFilesFreshness.refreshCommand).toBe("akan sync <app-or-lib>");
    expect(strict.validationCommands).toContain("akan doctor --strict --format json");
    expect(strict.repairActions.map((action) => action.command)).toContain(
      "akan repair module-shape --app demo --module post",
    );
  });

  test("reports unknown app root entries as errors", async () => {
    const { root, workspace, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${app.cwdPath}/base.ts`, "export const bad = true;\n");

    const result = await AkanContextAnalyzer.doctor(workspace);

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "app-root-unknown-entry", severity: "error", path: "apps/demo/base.ts" }),
    );
  });

  test("explains core agent-facing commands", () => {
    const runner = new ContextRunner();

    expect(runner.explainCommand("mcp")).toContain("permission mode");
    expect(runner.explainCommand("create-module")).toContain("scaffolds a database-backed domain module");
    expect(runner.explainCommand("mcp-install")).toContain("installs the Akan MCP server config");
    expect(runner.explainCommand("typecheck")).toContain("runs an application typecheck");
    expect(runner.explainCommand("sync")).toContain("refreshes generated Akan files");
    expect(runner.explainCommand("workflow plan")).toContain("returns a read-only plan");
    expect(runner.explainCommand("workflow validate")).toContain("stores a structured run report");
    expect(runner.explainCommand("repair generated")).toContain("refreshes generated Akan files");
    expect(runner.explainCommand("create-ui")).toContain("returns a primitive write report");
    expect(runner.explainCommand("add-field")).toContain("updates source constant/dictionary files");
    expect(runner.explainCommand("add-enum-field")).toContain("without editing generated files");
  });

  test("lists MCP tools by permission mode", () => {
    const runner = new ContextRunner();
    const readonlyTools = runner.listMcpTools("readonly").map((tool) => tool.name);
    const planTools = runner.listMcpTools("plan").map((tool) => tool.name);
    const applyTools = runner.listMcpTools("apply").map((tool) => tool.name);

    expect(readonlyTools).toContain("inspect_akan_context");
    expect(readonlyTools).toContain("doctor_workspace");
    expect(readonlyTools).not.toContain("plan_workflow");
    expect(planTools).toContain("plan_workflow");
    expect(planTools).not.toContain("apply_workflow");
    expect(applyTools).toContain("apply_workflow");
    expect(applyTools).toContain("repair_module_shape");
    expect(
      runner.listMcpTools("plan").find((tool) => tool.name === "plan_workflow")?.inputSchema.properties,
    ).toHaveProperty("out");
    expect(
      runner.listMcpTools("readonly").find((tool) => tool.name === "get_module_context")?.inputSchema.properties,
    ).toHaveProperty("app");
    const doctorSchema = runner.listMcpTools("readonly").find((tool) => tool.name === "doctor_workspace")
      ?.inputSchema.properties;
    expect(doctorSchema?.changedFiles).toMatchObject({ type: "array" });
    expect(doctorSchema?.includeBaselineDetails).toMatchObject({ type: "boolean" });
    const validationSchema = runner.listMcpTools("apply").find((tool) => tool.name === "run_validation")
      ?.inputSchema.properties;
    expect(validationSchema?.includeBaselineDetails).toMatchObject({ type: "boolean" });
    const inspectTool = runner.listMcpTools("readonly").find((tool) => tool.name === "inspect_akan_context");
    const inspectRequestSchema = inspectTool?.inputSchema.properties.request as {
      properties: { type: { enum: string[] } };
      required: string[];
      oneOf: { properties: { type: { const: string } }; required: string[] }[];
    };
    expect(inspectTool?.description).toContain("fieldInsertionContext");
    expect(inspectTool?.inputSchema.required).toEqual(["question", "draft", "review", "request"]);
    expect(inspectRequestSchema.required).toContain("type");
    expect(
      inspectRequestSchema.oneOf.find((branch) => branch.properties.type.const === "moduleContext")?.required,
    ).toEqual(["type", "app", "module"]);
    expect(
      inspectRequestSchema.oneOf.find((branch) => branch.properties.type.const === "fieldInsertionContext")?.required,
    ).toEqual(["type", "app", "module", "field", "fieldType"]);
    expect(inspectRequestSchema.oneOf.find((branch) => branch.properties.type.const === "escape")?.required).toEqual([
      "type",
      "reason",
    ]);
    expect(inspectRequestSchema.properties.type.enum).toEqual([
      "workspaceOverview",
      "moduleContext",
      "fieldInsertionContext",
      "workflowDiagnostics",
      "escape",
    ]);
    expect(
      runner
        .listMcpTools("apply")
        .filter((tool) => !tool.description || tool.description.length === 0)
        .map((tool) => tool.name),
    ).toEqual([]);
    expect(runner.listMcpTools("plan").find((tool) => tool.name === "plan_workflow")?.description).toContain(
      "next.tool=apply_workflow",
    );
  });

  test("returns source-body-free inspect_akan_context field insertion index evidence and escape", async () => {
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
    await new ModuleRunner().createModuleTemplate(module);
    const runner = new ContextRunner();

    const fieldContext = (await runner.callMcpTool(workspace, "inspect_akan_context", {
      question: "Can I add a title field to demo:post?",
      draft: { reason: "Need add-field context before planning.", type: "fieldInsertionContext" },
      review: "Module target and field inputs are known, source body is not needed for P1.",
      request: { type: "fieldInsertionContext", app: "demo", module: "post", field: "title", fieldType: "String" },
    })) as {
      schemaVersion: number;
      type: string;
      evidence: { kind: string; summary: string; path?: string }[];
      next: { action: string; tool?: string; args?: { workflow?: string; inputs?: { field?: string; type?: string } } };
      data: {
        files: { path: string; present: boolean }[];
        moduleIndex: {
          constant?: { inputClassName: string; builderName: string | null; fields: unknown[] };
          dictionary?: { modelClassName: string; translatorName: string | null; fields: unknown[] };
          fieldPresence: { name: string; requested: boolean; constant: boolean; dictionary: boolean }[];
        };
      };
    };
    const escape = (await runner.callMcpTool(workspace, "inspect_akan_context", {
      question: "Do I need to read source body?",
      draft: { reason: "The current index cannot answer detailed source shape.", type: "escape" },
      review: "Escaping is appropriate when source body evidence is required.",
      request: { type: "escape", reason: "Need source body for exact AST placement.", nextStep: "Read constant file." },
    })) as { type: string; evidence: { summary: string }[]; next: { action: string; args?: { nextStep?: string } } };

    expect(fieldContext).toMatchObject({ schemaVersion: 1, type: "fieldInsertionContext" });
    expect(fieldContext.evidence.map((item) => item.kind)).toContain("field-insertion");
    expect(fieldContext.next).toMatchObject({
      action: "plan_workflow",
      tool: "plan_workflow",
      args: { workflow: "add-field", inputs: { field: "title", type: "String" } },
    });
    expect(fieldContext.data.files.map((file) => file.path)).toContain("apps/demo/lib/post/post.constant.ts");
    expect(fieldContext.data.files.map((file) => file.path)).toContain("apps/demo/lib/post/post.dictionary.ts");
    expect(fieldContext.data.moduleIndex.constant).toMatchObject({
      inputClassName: "PostInput",
      builderName: "field",
    });
    expect(fieldContext.data.moduleIndex.dictionary).toMatchObject({
      modelClassName: "Post",
      translatorName: "t",
    });
    // The scaffold ships a starter `name` field wired through constant + dictionary so the module is green.
    expect(fieldContext.data.moduleIndex.constant?.fields).toContainEqual(
      expect.objectContaining({ name: "name", kind: "constant" }),
    );
    expect(fieldContext.data.moduleIndex.dictionary?.fields).toContainEqual(
      expect.objectContaining({ name: "name", kind: "dictionary" }),
    );
    expect(fieldContext.data.moduleIndex.fieldPresence).toContainEqual(
      expect.objectContaining({ name: "title", requested: true, constant: false, dictionary: false }),
    );
    expect(JSON.stringify(fieldContext)).not.toContain("export class");
    expect(JSON.stringify(fieldContext)).not.toContain("modelDictionary");
    expect(escape).toMatchObject({
      type: "escape",
      evidence: [{ summary: "Need source body for exact AST placement." }],
      next: { action: "escape", args: { nextStep: "Read constant file." } },
    });
  });

  test("returns validation contract modes as cumulative MCP tool lists", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    const contract = (await new ContextRunner().callMcpTool(workspace, "get_validation_contract")) as {
      modes: Record<"readonly" | "plan" | "apply", string[]>;
      directEditFallbackPolicy: {
        mode: string;
        directSourceEdits: string;
        applyRequiredWhen: string[];
        approvalMeaning: string;
        validationRequiredAfterApply: string[];
        fallbackAllowedWhen: string[];
      };
      validationStatuses: {
        overallStatus: string[];
        baselineSummary: string;
      };
      moduleContextInputs: {
        app: string;
      };
    };

    expect(contract.modes.readonly).toContain("doctor_workspace");
    expect(contract.modes.readonly).not.toContain("plan_workflow");
    expect(contract.modes.plan).toContain("doctor_workspace");
    expect(contract.modes.plan).toContain("plan_workflow");
    expect(contract.modes.plan).not.toContain("apply_workflow");
    expect(contract.modes.apply).toContain("doctor_workspace");
    expect(contract.modes.apply).toContain("plan_workflow");
    expect(contract.modes.apply).toContain("apply_workflow");
    expect(contract.directEditFallbackPolicy).toMatchObject({
      mode: "apply-first",
      directSourceEdits: "fallback-only",
    });
    expect(contract.directEditFallbackPolicy.applyRequiredWhen).toContain("plan_workflow returns planPath");
    expect(contract.directEditFallbackPolicy.approvalMeaning).toContain("not a separate MCP permission gate");
    expect(contract.directEditFallbackPolicy.validationRequiredAfterApply).toContain("validationTarget");
    expect(contract.directEditFallbackPolicy.fallbackAllowedWhen.join("\n")).toContain("no matching workflow");
    expect(contract.validationStatuses.overallStatus).toContain("blocked-by-workspace-config");
    expect(contract.validationStatuses.overallStatus).toContain("passed-with-baseline-blockers");
    expect(contract.validationStatuses.baselineSummary).toContain("includeBaselineDetails=true");
    expect(contract.moduleContextInputs.app).toBe("required");
  });

  test("installs Cursor MCP config while preserving existing servers", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(
      `${root}/.cursor/mcp.json`,
      `${JSON.stringify({ mcpServers: { existing: { type: "stdio", command: "node", args: ["server.js"] } } }, null, 2)}\n`,
    );

    const written = await new ContextRunner().installMcp(workspace, "cursor");
    const config = (await workspace.readJson(".cursor/mcp.json")) as {
      mcpServers: Record<string, { type: string; command: string; args: string[] }>;
    };

    expect(written).toBe(".cursor/mcp.json");
    expect(config.mcpServers.existing).toEqual({ type: "stdio", command: "node", args: ["server.js"] });
    expect(config.mcpServers.akan).toEqual(createAkanCursorMcpServer("readonly"));
  });

  test("installs Cursor MCP config with explicit apply mode", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    await new ContextRunner().installMcp(workspace, "cursor", { mode: "apply" });
    const config = (await workspace.readJson(".cursor/mcp.json")) as {
      mcpServers: Record<string, { type: string; command: string; args: string[] }>;
    };

    expect(config.mcpServers.akan).toEqual(createAkanCursorMcpServer("apply"));
  });

  test("requires force before overwriting an existing Akan MCP server entry", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(
      `${root}/.cursor/mcp.json`,
      `${JSON.stringify({ mcpServers: { akan: { type: "stdio", command: "other" } } }, null, 2)}\n`,
    );
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "cursor")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "cursor", { force: true })).resolves.toBe(".cursor/mcp.json");
  });

  test("installs Claude Code MCP config while preserving existing servers", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(
      `${root}/.mcp.json`,
      `${JSON.stringify({ mcpServers: { existing: { type: "stdio", command: "node", args: ["server.js"] } } }, null, 2)}\n`,
    );

    const written = await new ContextRunner().installMcp(workspace, "claude", { mode: "apply" });
    const config = (await workspace.readJson(".mcp.json")) as {
      mcpServers: Record<string, { type: string; command: string; args: string[] }>;
    };

    expect(written).toBe(".mcp.json");
    expect(config.mcpServers.existing).toEqual({ type: "stdio", command: "node", args: ["server.js"] });
    expect(config.mcpServers.akan).toEqual(createAkanClaudeMcpServer("apply"));
    // Claude does not guarantee the server cwd, so it must anchor on CLAUDE_PROJECT_DIR, not Cursor's ${workspaceFolder}.
    const claudeCommand = JSON.stringify(config.mcpServers.akan);
    expect(claudeCommand).toContain("CLAUDE_PROJECT_DIR");
    expect(claudeCommand).not.toContain("workspaceFolder");
  });

  test("requires force before overwriting an existing Claude Code MCP server entry", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(
      `${root}/.mcp.json`,
      `${JSON.stringify({ mcpServers: { akan: { type: "stdio", command: "other" } } }, null, 2)}\n`,
    );
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "claude")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "claude", { force: true })).resolves.toBe(".mcp.json");
  });

  test("installs Codex MCP config as TOML while preserving other tables", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${root}/.codex/config.toml`, 'model = "gpt-5-codex"\n\n[mcp_servers.other]\ncommand = "node"\n');

    const written = await new ContextRunner().installMcp(workspace, "codex", { mode: "plan" });
    const config = await workspace.readFile(".codex/config.toml");

    expect(written).toBe(".codex/config.toml");
    expect(config).toContain('model = "gpt-5-codex"');
    expect(config).toContain("[mcp_servers.other]");
    expect(config).toContain(createAkanCodexMcpServerBlock("plan").trim());
    expect(config).toContain("akan mcp --mode plan");
  });

  test("creates the Codex config from scratch when absent", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    await new ContextRunner().installMcp(workspace, "codex");
    const config = await workspace.readFile(".codex/config.toml");

    expect(config.trimStart()).toStartWith("[mcp_servers.akan]");
    expect(config).toContain(createAkanCodexMcpServerBlock("readonly").trim());
  });

  test("requires force before overwriting an existing Codex MCP server table", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${root}/.codex/config.toml`, '[mcp_servers.akan]\ncommand = "other"\n');
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "codex")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "codex", { force: true })).resolves.toBe(".codex/config.toml");
  });

  test("runs workflow read tools through MCP plan mode", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new ContextRunner();
    const planPath = `${root}/.akan/workflows/plans/task-priority.json`;

    const plan = (await runner.callMcpTool(
      workspace,
      "plan_workflow",
      {
        workflow: "add-field",
        inputs: { app: "demo", module: "task", field: "priority", type: "string" },
        out: planPath,
      },
      { mode: "plan" },
    )) as {
      mode: string;
      workflow: string;
      planPath: string;
      approval: { required: boolean; canApplyWith: { planPath: string } };
      next: { tool: string; args: { planPath: string } };
      policy: { mode: string; directSourceEdits: string };
    };
    const dryRun = (await runner.callMcpTool(
      workspace,
      "apply_workflow",
      { planPath, dryRun: true },
      { mode: "apply" },
    )) as {
      mode: string;
      status: string;
      applyReportPath: string;
      validationTarget: string;
      next: { tool: string; args: { runIdOrPlan: string } };
      policy: { mode: string; directSourceEdits: string };
    };

    expect(plan).toMatchObject({ mode: "plan", workflow: "add-field", planPath });
    expect(plan.approval).toMatchObject({ required: true, canApplyWith: { planPath } });
    expect(plan.next).toEqual({ tool: "apply_workflow", args: { planPath } });
    expect(plan.policy).toMatchObject({ mode: "apply-first", directSourceEdits: "fallback-only" });
    expect(await Bun.file(planPath).exists()).toBe(true);
    expect(dryRun).toMatchObject({ mode: "dry-run", status: "passed" });
    expect(dryRun.next).toEqual({ tool: "run_validation", args: { runIdOrPlan: dryRun.validationTarget } });
    expect(dryRun.policy).toMatchObject({ mode: "apply-first", directSourceEdits: "fallback-only" });
    expect(await Bun.file(`${root}/${dryRun.applyReportPath}`).exists()).toBe(true);
  });

  test("writes a default plan artifact from MCP plan_workflow", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    const plan = (await new ContextRunner().callMcpTool(
      workspace,
      "plan_workflow",
      {
        workflow: "add-field",
        inputs: { app: "demo", module: "task", field: "priority", type: "string" },
      },
      { mode: "plan" },
    )) as { mode: string; workflow: string; planPath: string; recommendations: { code: string }[] };

    expect(plan).toMatchObject({ mode: "plan", workflow: "add-field" });
    expect(plan.planPath).toBe(".akan/workflows/plans/add-field-demo-task-priority.json");
    expect(plan.recommendations.map((recommendation) => recommendation.code)).toContain("workflow-apply-first");
    expect(plan.recommendations.map((recommendation) => recommendation.code)).toContain(
      "workflow-validate-apply-report",
    );
    expect(plan.recommendations.map((recommendation) => recommendation.code)).toContain("add-field-component");
    expect(await Bun.file(`${root}/${plan.planPath}`).exists()).toBe(true);
  });

  test("splits doctor diagnostics by workflow context paths", async () => {
    const { root, workspace, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${app.cwdPath}/base.ts`, "export const bad = true;\n");
    await writeText(`${app.cwdPath}/lib/task/task.constant.ts`, "export class Task {}\n");
    const runner = new ContextRunner();
    const plan = (await runner.callMcpTool(
      workspace,
      "plan_workflow",
      {
        workflow: "add-field",
        inputs: { app: "demo", module: "task", field: "priority", type: "String" },
      },
      { mode: "plan" },
    )) as { planPath: string };

    const doctorSummary = (await runner.callMcpTool(
      workspace,
      "doctor_workspace",
      { strict: true, runIdOrPlan: plan.planPath },
      { mode: "apply" },
    )) as {
      baselineSummary: { totalErrors: number; detailsIncluded: boolean };
      baselineDiagnostics: { code: string }[];
      workflowDiagnostics: { code: string }[];
    };
    const doctor = (await runner.callMcpTool(
      workspace,
      "doctor_workspace",
      { strict: true, runIdOrPlan: plan.planPath, includeBaselineDetails: true },
      { mode: "apply" },
    )) as {
      baselineSummary: { detailsIncluded: boolean };
      baselineDiagnostics: { code: string }[];
      workflowDiagnostics: { code: string }[];
    };

    expect(doctorSummary.baselineSummary).toMatchObject({ totalErrors: expect.any(Number), detailsIncluded: false });
    expect(doctorSummary.baselineDiagnostics).toEqual([]);
    expect(doctor.baselineDiagnostics.map((diagnostic) => diagnostic.code)).toContain("app-root-unknown-entry");
    expect(doctor.baselineSummary.detailsIncluded).toBe(true);
    expect(doctor.workflowDiagnostics.map((diagnostic) => diagnostic.code)).toContain("module-shape-invalid");
  });

  test("filters get_module_context by app and reports ambiguous module-only matches", async () => {
    const { root, workspace, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeJson(`${root}/apps/ops/tsconfig.json`, { compilerOptions: { target: "ESNext", paths: {} } });
    await writeJson(`${root}/apps/ops/package.json`, {
      name: "ops",
      version: "1.0.0",
      description: "ops",
      dependencies: {},
      devDependencies: {},
    });
    await writeText(`${root}/apps/ops/akan.config.ts`, "export default {};\n");
    await new ModuleRunner().createModuleTemplate(ModuleExecutor.from(app, "post"));
    await new ModuleRunner().createModuleTemplate(ModuleExecutor.from(AppExecutor.from(workspace, "ops"), "post"));
    const runner = new ContextRunner();

    const ambiguous = (await runner.callMcpTool(workspace, "get_module_context", { module: "post" })) as {
      diagnostics: { code: string }[];
      candidates: { app: string; path: string }[];
    };
    const filtered = (await runner.callMcpTool(workspace, "get_module_context", { app: "ops", module: "post" })) as {
      sysName: string;
      path: string;
    }[];

    expect(ambiguous.diagnostics).toContainEqual(expect.objectContaining({ code: "module-context-ambiguous" }));
    expect(ambiguous.candidates.map((candidate) => candidate.app).sort()).toEqual(["demo", "ops"]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ sysName: "ops", path: "apps/ops/lib/post" });
  });

  test("blocks apply tools outside apply MCP mode", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);

    await expect(
      new ContextRunner().callMcpTool(
        workspace,
        "apply_workflow",
        { planPath: `${root}/missing.json`, dryRun: true },
        { mode: "readonly" },
      ),
    ).rejects.toThrow('MCP tool "apply_workflow" is not available in readonly mode');
  });

  test("returns repair reports through apply MCP mode", async () => {
    const { root, workspace, app } = await createTempApp("demo");
    tempRoots.push(root);
    await writeText(`${app.cwdPath}/lib/post/post.constant.ts`, "export class Post {}\n");

    const report = (await new ContextRunner().callMcpTool(
      workspace,
      "repair_module_shape",
      { app: "demo", module: "post" },
      { mode: "apply" },
    )) as { command: string; kind: string; repairActions: { command: string }[] };

    expect(report).toMatchObject({ command: "repair module-shape", kind: "module-shape" });
    expect(report.repairActions.map((action) => action.command)).toContain(
      "akan create-module post --app demo --format json",
    );
  });
});

describe("AgentRunner", () => {
  test("installs a single AGENTS.md source with thin Claude and Cursor references", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new AgentRunner();

    const written = await runner.install(workspace, ["cursor", "agents-md", "claude"]);
    expect(written).toEqual([".cursor/rules/akan.mdc", "AGENTS.md", "CLAUDE.md"]);

    // AGENTS.md is the single source of truth and carries the full workflow policy in a managed block.
    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    expect(agents).toContain("Before changing a domain");
    expect(agents).toContain("Prefer Akan MCP workflows before direct source edits");
    expect(agents).toContain("apply_workflow({ planPath })");
    expect(agents).toContain("validationTarget");
    expect(agents).toContain("Direct source edits are denied");
    expect(agents).toContain("akan mcp --mode plan");
    expect(agents).toContain("akan mcp --mode apply");
    expect(agents).toContain("akan repair generated");
    expect(agents).toContain("<!-- akan:agent:start -->");
    expect(agents).toContain("<!-- akan:agent:end -->");

    // CLAUDE.md and the Cursor rule are thin pointers to AGENTS.md, not duplicates of its content.
    const claude = await Bun.file(`${root}/CLAUDE.md`).text();
    expect(claude).toContain("@AGENTS.md");
    expect(claude).not.toContain("Prefer Akan MCP workflows before direct source edits");
    const cursor = await Bun.file(`${root}/.cursor/rules/akan.mdc`).text();
    expect(cursor).toContain("@AGENTS.md");
    expect(cursor).not.toContain("Prefer Akan MCP workflows before direct source edits");

    // The Claude/Cursor pointers need --force to overwrite once they exist.
    await expect(runner.install(workspace, ["cursor"])).rejects.toThrow("already exists");
  });

  test("preserves hand-written AGENTS.md content and refreshes only the managed block", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new AgentRunner();

    await runner.install(workspace, ["agents-md"]);
    const first = await Bun.file(`${root}/AGENTS.md`).text();

    // Hand-written content placed outside the markers must survive a re-install without --force.
    await Bun.write(`${root}/AGENTS.md`, `${first}\n## Team Notes\n\nUse feature branches.\n`);
    const written = await runner.install(workspace, ["agents-md"]);
    expect(written).toEqual(["AGENTS.md"]);

    const refreshed = await Bun.file(`${root}/AGENTS.md`).text();
    expect(refreshed).toContain("## Team Notes");
    expect(refreshed).toContain("Use feature branches.");
    expect(refreshed).toContain("Prefer Akan MCP workflows before direct source edits");
    // Re-installing does not duplicate the managed block.
    expect(refreshed.split("<!-- akan:agent:start -->").length - 1).toBe(1);
  });

  test("guides removal of scaffolded samples while they exist", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new AgentRunner();

    await writeText(`${root}/apps/demo/lib/task/task.constant.ts`, "// sample\n");
    await writeText(`${root}/apps/demo/lib/_noti/noti.service.ts`, "// sample\n");
    await writeText(`${root}/apps/demo/lib/__scalar/workHistory/workHistory.dictionary.ts`, "// sample\n");
    await writeText(`${root}/apps/demo/page/task/_index.tsx`, "// sample\n");
    await writeText(`${root}/apps/demo/page/_index.tsx`, "// Akan.js template landing page\n");

    await runner.install(workspace, ["agents-md"]);
    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    expect(agents).toContain("Start Clean (Remove Scaffolded Samples)");
    expect(agents).toContain("apps/demo/lib/task");
    expect(agents).toContain("apps/demo/lib/_noti");
    expect(agents).toContain("apps/demo/lib/__scalar/workHistory");
    expect(agents).toContain("apps/demo/page/task");
    expect(agents).toContain("default Akan landing page");
  });

  test("omits the sample cleanup section when no samples remain", async () => {
    const { root, workspace } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new AgentRunner();

    // A workspace with no scaffolded samples and a custom index page.
    await writeText(`${root}/apps/demo/page/_index.tsx`, "export default function Page() {\n  return null;\n}\n");

    await runner.install(workspace, ["agents-md"]);
    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    expect(agents).not.toContain("Start Clean (Remove Scaffolded Samples)");
  });
});
