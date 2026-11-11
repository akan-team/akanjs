import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import {
  AkanContextAnalyzer,
  createAkanClaudeMcpServer,
  createAkanCodexMcpServerBlock,
  createAkanCursorMcpServer,
} from "@akanjs/devkit/context/akanContext";
import { AkanMcpToolError } from "@akanjs/devkit/context/akanMcpToolError";
import { AppExecutor, ModuleExecutor } from "@akanjs/devkit/executors";
import {
  createTempApp,
  createTempModule,
  makeCliTempWorkspace,
  tempRoots,
  writeJson,
  writeText,
} from "@akanjs/devkit/test/testHelpers";
import { MCP_FAILURE_META } from "akanjs/common";
import { AgentRunner } from "../agent/agent.runner";
import { ApplicationRunner } from "../application/application.runner";
import { LibraryRunner } from "../library/library.runner";
import { ModuleRunner } from "../module/module.runner";
import { ContextRunner } from "./context.runner";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

describe("ContextRunner", () => {
  test("prints module context with abstract content before module files", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);

    const output = await new ContextRunner().getContext(workspace, { module: "post" });

    expect(output).toContain("# post Abstract");
    expect(output.indexOf("# post Abstract")).toBeLessThan(output.indexOf("- Files:"));
  });

  test("prints generated file and validation contracts in json context", async () => {
    const { workspace } = track(await createTempApp("demo"));

    const output = await new ContextRunner().getContext(workspace, { format: "json" });
    const context = JSON.parse(output) as Awaited<ReturnType<typeof AkanContextAnalyzer.analyze>>;

    expect(context.generatedFiles).not.toContain("*/lib/option.ts");
    expect(context.generatedFiles).toContain("*/ui/index.ts");
    expect(context.validationCommands).toContain("akan sync <app-or-lib>");
    expect(context.validationCommands).toContain("akan doctor --strict --format json");
    expect(context.validationCommands.join("\n")).not.toContain("akan scan");
  });

  test("lists the app's routes with their search names and guards, and folds a folder past the limit", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    const pageOf = (chain: string) =>
      `import { page } from "akanjs/client";\nexport default page()${chain}.render(() => null);\n`;
    await writeText(`${app.cwdPath}/page/_index.tsx`, pageOf(""));
    await writeText(
      `${app.cwdPath}/page/admin/_layout.tsx`,
      'import { layout } from "akanjs/client";\nexport default layout().guard(() => true).render(({ children }) => children);\n',
    );
    await writeText(`${app.cwdPath}/page/admin/users.tsx`, pageOf('.search("q", String)'));
    await writeText(`${app.cwdPath}/page/memo/[memoId].tsx`, pageOf('.param("memoId")'));
    for (let idx = 0; idx < AkanContextAnalyzer.routeListLimit; idx++)
      await writeText(`${app.cwdPath}/page/(docs)/doc${idx}.tsx`, pageOf(""));

    const context = JSON.parse(
      await new ContextRunner().getContext(workspace, { format: "json", app: "demo" }),
    ) as Awaited<ReturnType<typeof AkanContextAnalyzer.analyze>>;
    const routes = context.apps[0]?.routes ?? [];
    expect(routes).toHaveLength(AkanContextAnalyzer.routeListLimit + 3);
    expect(routes.find((route) => route.path === "/admin/users")).toEqual({
      path: "/admin/users",
      file: "apps/demo/page/admin/users.tsx",
      search: ["q"],
      guarded: true,
      devOnly: false,
    });

    const markdown = await new ContextRunner().getContext(workspace, { app: "demo" });
    expect(markdown).toContain("- /admin/users ?q (guarded) — apps/demo/page/admin/users.tsx");
    expect(markdown).toContain("- /memo/:memoId — apps/demo/page/memo/[memoId].tsx");
    expect(markdown).toContain(`- apps/demo/page/(docs)/: ${AkanContextAnalyzer.routeListLimit} routes folded`);
    expect(markdown).not.toContain("- /doc0 —");
    expect(await new ContextRunner().getContext(workspace, {})).not.toContain("## Routes");
  });

  test("reports missing abstract as warning by default and error in strict mode", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
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

  test("passes strict on a new app and library, whose own service modules come with an abstract", async () => {
    const { workspace } = track(await makeCliTempWorkspace());
    await new ApplicationRunner().createApplication("demo", workspace);
    await new LibraryRunner().createLibrary("mylib", workspace);

    const strict = await AkanContextAnalyzer.doctor(workspace, { strict: true });

    expect(strict.diagnostics).toEqual([]);
    expect(strict.status).toBe("passed");
  });

  test("doctor ignores a malformed workflow artifact instead of throwing", async () => {
    const { workspace } = track(await createTempApp("demo"));
    const plan = { schemaVersion: 1, mode: "plan", workflow: "add-field" };
    const artifacts = [
      { schemaVersion: 1, mode: "apply" },
      { schemaVersion: 1, mode: "dry-run", changedFiles: [{ path: "apps/demo/a.ts" }], generatedFiles: [], plan },
      plan,
      { schemaVersion: 1, mode: "plan", inputs: {}, predictedChanges: [null] },
      { schemaVersion: 1, mode: "validate", plan: { ...plan, inputs: null, predictedChanges: [] } },
    ];
    for (const [idx, artifact] of artifacts.entries()) {
      const artifactPath = `.akan/workflows/runs/broken-${idx}.json`;
      await writeJson(`${workspace.workspaceRoot}/${artifactPath}`, artifact);
      const result = await AkanContextAnalyzer.doctor(workspace, { runIdOrPlan: artifactPath });
      expect(result).not.toHaveProperty("workflowDiagnostics");
    }
  });

  test("reports unknown app root entries as errors", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    await writeText(`${app.cwdPath}/base.ts`, "export const bad = true;\n");

    const result = await AkanContextAnalyzer.doctor(workspace);

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "app-root-unknown-entry", severity: "error", path: "apps/demo/base.ts" }),
    );
  });

  test("reports a hand-written facet index that shadows the generated barrel, but not a folder namespace", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    await writeText(`${app.cwdPath}/ui/index.tsx`, 'export { Chat } from "./Chat";\n');
    await writeText(`${app.cwdPath}/ui/Chat/index.tsx`, "export const Chat = () => null;\n");

    const result = await AkanContextAnalyzer.doctor(workspace);
    const shadows = result.diagnostics.filter((diagnostic) => diagnostic.code === "facet-index-shadowed");

    expect(result.status).toBe("failed");
    expect(shadows).toEqual([expect.objectContaining({ severity: "error", path: "apps/demo/ui/index.tsx" })]);
    expect(shadows[0]?.message).toContain("apps/demo/ui/index.tsx shadows the generated ui/index.ts");
  });

  test("warns about the Next.js and Tailwind-plugin leftovers older templates wrote", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    await writeJson(`${app.cwdPath}/tsconfig.json`, {
      compilerOptions: { jsx: "preserve", plugins: [{ name: "next" }] },
      include: ["./**/*.ts", ".next/types/**/*.ts"],
    });
    await writeText(`${workspace.workspaceRoot}/bunfig.toml`, '[serve.static]\nplugins = ["bun-plugin-tailwind"]\n');

    const result = await AkanContextAnalyzer.doctor(workspace);
    const leftovers = result.diagnostics.filter((diagnostic) => diagnostic.code === "config-leftover");

    expect(result.status).toBe("passed");
    expect(leftovers.map(({ path, severity }) => ({ path, severity }))).toEqual([
      { path: "apps/demo/tsconfig.json", severity: "warning" },
      { path: "bunfig.toml", severity: "warning" },
    ]);

    await writeJson(`${app.cwdPath}/tsconfig.json`, { compilerOptions: { jsx: "preserve" }, include: ["./**/*.ts"] });
    await writeText(`${workspace.workspaceRoot}/bunfig.toml`, "");
    const cleaned = await AkanContextAnalyzer.doctor(workspace);
    expect(cleaned.diagnostics.filter((diagnostic) => diagnostic.code === "config-leftover")).toEqual([]);
  });

  test("warns once the AGENTS.md chain Codex reads nears its 32 KiB cut", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
    const oversized = (result: Awaited<ReturnType<typeof AkanContextAnalyzer.doctor>>) =>
      result.diagnostics.filter((diagnostic) => diagnostic.code === "agent-guide-oversized");

    await writeText(`${workspace.workspaceRoot}/AGENTS.md`, "x".repeat(24 * 1024));
    await writeText(`${app.cwdPath}/AGENTS.md`, "x".repeat(1024));
    expect(oversized(await AkanContextAnalyzer.doctor(workspace))).toEqual([]);

    await writeText(`${app.cwdPath}/AGENTS.md`, "x".repeat(4 * 1024));
    const result = await AkanContextAnalyzer.doctor(workspace);
    expect(result.status).toBe("passed");
    expect(oversized(result)).toEqual([expect.objectContaining({ severity: "warning", path: "AGENTS.md" })]);
    expect(oversized(result)[0]?.message).toStartWith("AGENTS.md and apps/demo/AGENTS.md add up to 28 KiB");
  });

  test("warns about the agent guide copies older templates wrote beside AGENTS.md", async () => {
    const { workspace } = track(await createTempApp("demo"));
    const root = workspace.workspaceRoot;
    const leftovers = async () =>
      (await AkanContextAnalyzer.doctor(workspace)).diagnostics
        .filter((diagnostic) => diagnostic.code === "agent-guide-leftover")
        .map(({ path, severity, message }) => ({ path, severity, message }));

    await writeText(`${root}/AGENTS.md`, "# Guide\n\nSee `docs/AI-DEVELOPMENT.md` and `docs/GENERATED.md`.\n");
    await writeText(`${root}/docs/AI-DEVELOPMENT.md`, "# AI development\n");
    expect(await leftovers()).toEqual([
      {
        path: "docs/AI-DEVELOPMENT.md",
        severity: "warning",
        message: expect.stringContaining("delete it and the AGENTS.md sentence that points to it"),
      },
      {
        path: "AGENTS.md",
        severity: "warning",
        message: expect.stringContaining("AGENTS.md points to docs/GENERATED.md, which is gone"),
      },
    ]);

    await writeText(`${root}/AGENTS.md`, "# Guide\n");
    await rm(`${root}/docs`, { recursive: true, force: true });
    expect(await leftovers()).toEqual([]);
  });

  test("explains core agent-facing commands", () => {
    const runner = new ContextRunner();

    expect(runner.explainCommand("mcp")).toContain("permission mode");
    expect(runner.explainCommand("create-module")).toContain("scaffolds a database-backed domain module");
    expect(runner.explainCommand("mcp-install")).toContain("installs the Akan MCP server config");
    expect(runner.explainCommand("typecheck")).toContain("typechecks an app or a library");
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
    const { workspace, module } = track(await createTempModule("post"));
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

  test("draws the module's graph from source for get_graph and never reads env files", async () => {
    const { workspace, app, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    await writeText(`${app.cwdPath}/env/env.server.local.ts`, "export const leaked = fetch.slice.post;\n");

    const graph = (await new ContextRunner().callMcpTool(workspace, "get_graph", { app: "demo", module: "post" })) as {
      nodes: { id: string; kind: string; at: { file: string } | null }[];
      edges: { from: string; to: string }[];
    };

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(["model:apps/demo:post", "slice:apps/demo:post", "query:apps/demo:post"]),
    );
    const ids = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(graph.nodes.some((node) => node.at?.file.includes("/env/"))).toBe(false);
    expect(new ContextRunner().listMcpTools("readonly").map((tool) => tool.name)).toContain("get_graph");
  });

  test("draws the Change Map since a commit for get_graph, uncommitted work included and env files left out", async () => {
    const { workspace, app, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const git = (...args: string[]) =>
      expect(
        Bun.spawnSync(
          ["git", "-c", "user.name=akan", "-c", "user.email=akan@example.com", "-c", "commit.gpgsign=false", ...args],
          { cwd: workspace.workspaceRoot },
        ).exitCode,
      ).toBe(0);
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "--no-verify", "-m", "base");
    const dir = `${app.cwdPath}/lib/post`;
    const edit = async (file: string, from: string, to: string) => {
      const text = await Bun.file(`${dir}/${file}`).text();
      expect(text).toContain(from);
      await writeText(`${dir}/${file}`, text.replace(from, to));
    };
    await edit("post.constant.ts", "name: field(String),", "name: field(String),\n  pinned: field(Boolean),");
    await edit("post.service.ts", "=> ({})) {}", "=> ({})) {\n  async pin(id: string) {\n    return id;\n  }\n}");
    await writeText(`${dir}/post.dictionary.ts`, `${await Bun.file(`${dir}/post.dictionary.ts`).text()}\n`);
    await writeText(`${app.cwdPath}/env/env.server.local.ts`, "export const leaked = 1;\n");

    const changes = (await new ContextRunner().callMcpTool(workspace, "get_graph", {
      app: "demo",
      module: "post",
      since: "HEAD",
    })) as {
      since: string;
      summary: { added: number };
      nodes: { id: string; change?: string; fields?: { name: string; change?: string }[] }[];
      unmapped: { file: string; change: string }[];
    };
    expect(changes.since).toMatch(/^[0-9a-f]{12}$/);
    const post = changes.nodes.find((node) => node.id === "model:apps/demo:post");
    expect(post?.change).toBe("changed");
    expect(post?.fields?.find((field) => field.name === "pinned")?.change).toBe("added");
    expect(changes.nodes.find((node) => node.id === "method:apps/demo:post.pin")?.change).toBe("added");
    expect(changes.summary.added).toBeGreaterThan(0);
    expect(changes.unmapped).toContainEqual({ file: "apps/demo/lib/post/post.dictionary.ts", change: "changed" });
    expect(changes.unmapped.some(({ file }) => file.includes("/env/"))).toBe(false);

    for (const since of ["no-such-branch", "--output=/tmp/x"])
      expect(await new ContextRunner().callMcpTool(workspace, "get_graph", { since })).toEqual({
        diagnostics: [expect.objectContaining({ code: "graph-since-unknown", input: "since" })],
      });
  });

  test("returns validation contract modes as cumulative MCP tool lists", async () => {
    const { workspace } = track(await createTempApp("demo"));

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
    expect(contract.directEditFallbackPolicy.applyRequiredWhen).toEqual([
      "plan_workflow returns next.tool=apply_workflow",
    ]);
    expect(contract.directEditFallbackPolicy.approvalMeaning).toContain("not a separate MCP permission gate");
    expect(contract.directEditFallbackPolicy.validationRequiredAfterApply).toContain("validationTarget");
    expect(contract.directEditFallbackPolicy.fallbackAllowedWhen.join("\n")).toContain("no matching workflow");
    expect(contract.validationStatuses.overallStatus).toContain("blocked-by-workspace-config");
    expect(contract.validationStatuses.overallStatus).toContain("passed-with-baseline-blockers");
    expect(contract.validationStatuses.baselineSummary).toContain("includeBaselineDetails=true");
    expect(contract.moduleContextInputs.app).toBe("required");
  });

  test("installs Cursor MCP config while preserving existing servers", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
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
    const { workspace } = track(await createTempApp("demo"));

    await new ContextRunner().installMcp(workspace, "cursor", { mode: "apply" });
    const config = (await workspace.readJson(".cursor/mcp.json")) as {
      mcpServers: Record<string, { type: string; command: string; args: string[] }>;
    };

    expect(config.mcpServers.akan).toEqual(createAkanCursorMcpServer("apply"));
  });

  test("requires force before overwriting an existing Akan MCP server entry", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    await writeText(
      `${root}/.cursor/mcp.json`,
      `${JSON.stringify({ mcpServers: { akan: { type: "stdio", command: "other" } } }, null, 2)}\n`,
    );
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "cursor")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "cursor", { force: true })).resolves.toBe(".cursor/mcp.json");
  });

  test("installs Claude Code MCP config while preserving existing servers", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
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
    const { root, workspace } = track(await createTempApp("demo"));
    await writeText(
      `${root}/.mcp.json`,
      `${JSON.stringify({ mcpServers: { akan: { type: "stdio", command: "other" } } }, null, 2)}\n`,
    );
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "claude")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "claude", { force: true })).resolves.toBe(".mcp.json");
  });

  test("installs Codex MCP config as TOML while preserving other tables", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
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
    const { workspace } = track(await createTempApp("demo"));

    await new ContextRunner().installMcp(workspace, "codex");
    const config = await workspace.readFile(".codex/config.toml");

    expect(config.trimStart()).toStartWith("[mcp_servers.akan]");
    expect(config).toContain(createAkanCodexMcpServerBlock("readonly").trim());
  });

  test("requires force before overwriting an existing Codex MCP server table", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    await writeText(`${root}/.codex/config.toml`, '[mcp_servers.akan]\ncommand = "other"\n');
    const runner = new ContextRunner();

    await expect(runner.installMcp(workspace, "codex")).rejects.toThrow('already has an "akan" MCP server');
    await expect(runner.installMcp(workspace, "codex", { force: true })).resolves.toBe(".codex/config.toml");
  });

  test("runs workflow read tools through MCP plan mode, and names the apply after a dry run", async () => {
    const { root, workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);
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
      next: { tool: string; args: { planPath: string } };
      policy: { mode: string; directSourceEdits: string };
    };
    const applied = (await runner.callMcpTool(workspace, "apply_workflow", dryRun.next.args, { mode: "apply" })) as {
      mode: string;
      status: string;
      validationTarget: string;
      next: { tool: string; args: { runIdOrPlan: string } };
    };

    expect(plan).toMatchObject({ mode: "plan", workflow: "add-field", planPath });
    expect(plan.approval).toMatchObject({ required: true, canApplyWith: { planPath } });
    expect(plan.next).toEqual({ tool: "apply_workflow", args: { planPath } });
    expect(plan.policy).toMatchObject({ mode: "apply-first", directSourceEdits: "fallback-only" });
    expect(await Bun.file(planPath).exists()).toBe(true);
    expect(dryRun).toMatchObject({ mode: "dry-run", status: "passed" });
    expect(dryRun.next).toEqual({ tool: "apply_workflow", args: { planPath } });
    expect(dryRun.policy).toMatchObject({ mode: "apply-first", directSourceEdits: "fallback-only" });
    expect(await Bun.file(`${root}/${dryRun.applyReportPath}`).exists()).toBe(true);
    expect(applied).toMatchObject({ mode: "apply", status: "passed" });
    expect(applied.next).toEqual({ tool: "run_validation", args: { runIdOrPlan: applied.validationTarget } });
    expect(await module.readFile("task.constant.ts")).toContain("priority: field(String),");
  });

  test("writes a default plan artifact from MCP plan_workflow", async () => {
    const { root, workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);

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

  test("names no next tool for an MCP plan or apply that failed", async () => {
    const { workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);
    const runner = new ContextRunner();

    const plan = (await runner.callMcpTool(
      workspace,
      "plan_workflow",
      { workflow: "add-field", inputs: { app: "demo", module: "task", field: "budget", type: "Number" } },
      { mode: "apply" },
    )) as {
      planPath: string;
      diagnostics: { severity: string; code: string }[];
      approval: Record<string, unknown>;
      recommendations: { code: string }[];
    };
    const reports = (await Promise.all(
      [true, false].map((dryRun) =>
        runner.callMcpTool(workspace, "apply_workflow", { planPath: plan.planPath, dryRun }, { mode: "apply" }),
      ),
    )) as Record<string, unknown>[];

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({ severity: "error", code: "primitive-field-type-unsupported" }),
    ]);
    expect(plan).not.toHaveProperty("next");
    expect(plan.approval).toMatchObject({ required: true, applyTool: "apply_workflow" });
    expect(plan.approval).not.toHaveProperty("canApplyWith");
    expect(plan.recommendations.map((recommendation) => recommendation.code)).not.toContain("workflow-apply-first");
    expect(plan.recommendations.map((recommendation) => recommendation.code)).not.toContain(
      "workflow-validate-apply-report",
    );
    expect(reports).toEqual([
      expect.objectContaining({ mode: "dry-run", status: "failed" }),
      expect.objectContaining({ mode: "apply", status: "failed" }),
    ]);
    for (const report of reports) expect(report).not.toHaveProperty("next");
  });

  test("refuses an MCP plan_workflow for a module the target lacks, in the MCP server's workspace", async () => {
    const { workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);

    const plan = (await new ContextRunner().callMcpTool(
      workspace,
      "plan_workflow",
      { workflow: "add-field", inputs: { app: "demo", module: "pokemon", field: "nickname", type: "String" } },
      { mode: "plan" },
    )) as { diagnostics: { severity: string; code: string; message: string }[] };

    expect(plan.diagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        code: "workflow-module-missing",
        message: expect.stringContaining("Its database modules are task."),
      }),
    ]);
  });

  test("splits doctor diagnostics by workflow context paths", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
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
    const { root, workspace, app } = track(await createTempApp("demo"));
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
    expect(ambiguous.candidates.map((candidate) => candidate.app).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
      ["demo", "ops"],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ sysName: "ops", path: "apps/ops/lib/post" });
  });

  test("blocks apply tools outside apply MCP mode", async () => {
    const { root, workspace } = track(await createTempApp("demo"));

    await expect(
      new ContextRunner().callMcpTool(
        workspace,
        "apply_workflow",
        { planPath: `${root}/missing.json`, dryRun: true },
        { mode: "readonly" },
      ),
    ).rejects.toThrow('MCP tool "apply_workflow" is not available in readonly mode');
  });

  test("answers a refused or failed tool call with a code beside the text the model reads", async () => {
    const { workspace } = track(await createTempApp("demo"));
    const runner = new ContextRunner();
    const failureOf = (answer: { _meta?: Record<string, unknown> }) => answer._meta?.[MCP_FAILURE_META];
    const unavailable = await runner.answerMcpTool(workspace, "apply_workflow", { planPath: "plan", dryRun: true });
    expect(unavailable).toMatchObject({
      content: [{ type: "text", text: 'MCP tool "apply_workflow" is not available in readonly mode.' }],
      isError: true,
    });
    expect(failureOf(unavailable)).toEqual({ code: "toolUnavailable", statusCode: 400 });
    expect(failureOf(await runner.answerMcpTool(workspace, "get_guideline", {}))).toEqual({
      code: "invalidArgument",
      statusCode: 400,
    });
    const outside = await runner.answerMcpTool(workspace, "doctor_workspace", { runIdOrPlan: "/tmp/plan.json" });
    expect(failureOf(outside)).toEqual({ code: "invalidArgument", statusCode: 400 });
    const unlisted = await runner.answerMcpTool(workspace, "get_guideline", { name: "no-such-guideline" });
    expect(unlisted.content[0].text).toStartWith('Unknown guideline "no-such-guideline". Available: ');
    expect(failureOf(unlisted)).toEqual({ code: "invalidArgument", statusCode: 400 });
    const nope = await runner.answerMcpTool(workspace, "nope", {}, { mode: "apply" });
    expect(nope.content[0].text).toBe("Unknown tool: nope");
    expect(failureOf(nope)).toEqual({ code: "unknownTool", statusCode: 400 });
    expect(failureOf(await runner.answerMcpTool(workspace, "nope", {}))).toEqual({
      code: "unknownTool",
      statusCode: 400,
    });
    expect(AkanMcpToolError.failureOf(new Error("disk full"))).toEqual({ code: "toolFailed", statusCode: 500 });
    const answered = await runner.answerMcpTool(workspace, "get_validation_contract", {});
    expect(answered).not.toHaveProperty("isError");
    expect(answered).not.toHaveProperty("_meta");
  });

  test("keeps MCP workflow paths inside .akan/workflows and repairs only workspace targets", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new ContextRunner();
    const inputs = { app: "demo", module: "task", field: "priority", type: "String" };
    const refused: [string, Record<string, unknown>][] = [
      ["plan_workflow", { workflow: "add-field", inputs, out: `${root}/apps/demo/plan.json` }],
      ["apply_workflow", { planPath: "../plan.json", dryRun: true }],
      ["run_validation", { runIdOrPlan: `${root}/package.json` }],
      ["doctor_workspace", { runIdOrPlan: "/tmp/plan.json" }],
    ];

    for (const [name, args] of refused)
      await expect(runner.callMcpTool(workspace, name, args, { mode: "apply" })).rejects.toThrow(
        "MCP workflow files live under .akan/workflows/",
      );
    const repair = (await runner.callMcpTool(
      workspace,
      "repair_generated",
      { app: "demo; touch marker #" },
      { mode: "apply" },
    )) as { status: string; commands: unknown[]; diagnostics: { code: string }[] };
    expect(repair).toMatchObject({ status: "failed", commands: [] });
    expect(repair.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["repair-input-unknown"]);
  });

  test("returns repair reports through apply MCP mode", async () => {
    const { workspace, app } = track(await createTempApp("demo"));
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
  const previousEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ["AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"]) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of ["AKAN_PUBLIC_REPO_NAME", "AKAN_PUBLIC_SERVE_DOMAIN"]) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  test("installs a single AGENTS.md source with thin Claude and Cursor references", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new AgentRunner();

    const written = await runner.install(workspace, ["cursor", "agents-md", "claude"]);
    expect(written.slice(0, 3)).toEqual([".cursor/rules/akan.mdc", "AGENTS.md", "CLAUDE.md"]);
    expect(written.slice(3).every((path) => path.endsWith("/AGENTS.md"))).toBe(true);

    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    expect(agents).toContain("*.abstract.md");
    expect(agents).toContain("Prefer an Akan workflow to a hand edit");
    expect(agents).toContain("`akan workflow list`");
    expect(agents).toContain("apply_workflow");
    expect(agents).toContain("akan verify [<app-or-lib>]");
    expect(agents).toContain("akan repair generated");
    expect(agents).toContain("<!-- akan:agent:start -->");
    expect(agents).toContain("<!-- akan:agent:end -->");
    expect(agents).toContain("Biome sorts it");
    expect(agents).toContain("## Where Code Goes");
    expect(agents).toMatch(/<!-- akan:agent:version \S+ -->/);
    // The block indexes the path rules and skills instead of inlining them.
    expect(agents).toContain("| `{apps,libs}/**/page/**` | `.claude/rules/akan/page.md` |");
    expect(agents).toContain("`akan-page`");
    expect(agents).not.toContain("## Akan Page Routing");
    expect(agents).not.toContain("<%= appName %>");
    const block = agents.slice(agents.indexOf("<!-- akan:agent:start -->"), agents.indexOf("<!-- akan:agent:end -->"));
    expect(Buffer.byteLength(block)).toBeLessThanOrEqual(12 * 1024);

    const claude = await Bun.file(`${root}/CLAUDE.md`).text();
    expect(claude).toContain("@AGENTS.md");
    expect(claude).not.toContain("Prefer an Akan workflow to a hand edit");
    // The comment rule is the one thing CLAUDE.md restates instead of leaving to the guide.
    expect(claude).toContain("## Comments — Overrides Your Default");
    const cursor = await Bun.file(`${root}/.cursor/rules/akan.mdc`).text();
    expect(cursor).toContain("@AGENTS.md");
    expect(cursor).not.toContain("Prefer an Akan workflow to a hand edit");

    // The Claude/Cursor pointers are kept once they exist; only --force overwrites them.
    await Bun.write(`${root}/CLAUDE.md`, "custom\n");
    expect(await runner.install(workspace, ["cursor", "claude"])).toEqual([]);
    expect(await Bun.file(`${root}/CLAUDE.md`).text()).toBe("custom\n");
  });

  test("preserves hand-written AGENTS.md content and refreshes only the managed block", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new AgentRunner();

    await runner.install(workspace, ["agents-md"]);
    const first = await Bun.file(`${root}/AGENTS.md`).text();

    await Bun.write(`${root}/AGENTS.md`, `${first}\n## Team Notes\n\nUse feature branches.\n`);
    const written = await runner.install(workspace, ["agents-md"]);
    expect(written[0]).toBe("AGENTS.md");
    expect(written.slice(1).every((path) => path.endsWith("/AGENTS.md"))).toBe(true);

    const refreshed = await Bun.file(`${root}/AGENTS.md`).text();
    expect(refreshed).toContain("## Team Notes");
    expect(refreshed).toContain("Use feature branches.");
    expect(refreshed).toContain("Prefer an Akan workflow to a hand edit");
    expect(refreshed.split("<!-- akan:agent:start -->").length - 1).toBe(1);
  });

  test("writes path rules and skills, prunes what it generated before, and keeps what the user took over", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new AgentRunner();

    const written = await runner.install(workspace, ["rules", "skills"]);
    expect(written[0]).toMatch(/^rules: \d+ files, \d+ changed$/);
    expect(written[1]).toMatch(/^skills: \d+ files, \d+ changed$/);

    const rule = await Bun.file(`${root}/.claude/rules/akan/page.md`).text();
    expect(rule).toStartWith("---\ndescription: ");
    expect(rule).toContain('  - "apps/**/page/**"\n  - "libs/**/page/**"');
    expect(rule).toContain("<!-- akan:generated -->");
    expect(rule).toContain("# Akan Page Routing");
    const cursor = await Bun.file(`${root}/.cursor/rules/akan-page.mdc`).text();
    expect(cursor).toContain("globs: apps/**/page/**,libs/**/page/**\nalwaysApply: false");
    expect(cursor).toContain("@.claude/rules/akan/page.md");

    const skill = await Bun.file(`${root}/.claude/skills/akan-page/SKILL.md`).text();
    expect(skill).toStartWith("---\nname: akan-page\n");
    expect(skill).toContain("`.agents/skills/akan-page/references/pageRule.md`");
    expect(await Bun.file(`${root}/.agents/skills/akan-page/SKILL.md`).text()).toBe(skill);
    expect(await Bun.file(`${root}/.agents/skills/akan-page/references/pageRule.md`).exists()).toBe(true);
    expect(await Bun.file(`${root}/.claude/skills/akan-code/SKILL.md`).exists()).toBe(false);

    for (const file of new Bun.Glob(".claude/rules/akan/*.md").scanSync({ cwd: root, dot: true }))
      expect([file, Buffer.byteLength(await Bun.file(`${root}/${file}`).text()) <= 8 * 1024]).toEqual([file, true]);
    for (const file of new Bun.Glob(".agents/skills/*/references/*.md").scanSync({ cwd: root, dot: true }))
      expect([file, (await Bun.file(`${root}/${file}`).text()).length <= 30_000]).toEqual([file, true]);

    await Bun.write(`${root}/.claude/rules/akan/retired.md`, "---\n---\n\n<!-- akan:generated -->\n");
    await Bun.write(`${root}/.claude/rules/akan/team.md`, "# Team rule\n");
    await Bun.write(`${root}/.claude/rules/akan/page.md`, "# Our page rule\n");
    const rerun = await runner.install(workspace, ["rules"]);
    expect(rerun).toEqual([expect.stringMatching(/, 1 stale removed$/)]);
    expect(await Bun.file(`${root}/.claude/rules/akan/retired.md`).exists()).toBe(false);
    expect(await Bun.file(`${root}/.claude/rules/akan/team.md`).text()).toBe("# Team rule\n");
    expect(await Bun.file(`${root}/.claude/rules/akan/page.md`).text()).toBe("# Our page rule\n");
  }, 60_000);

  test("checks what install would change without writing, ignoring the version stamp and the user's files", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new AgentRunner();
    const targets = ["cursor", "agents-md", "claude", "rules", "skills"] as const;

    expect((await runner.check(workspace, [...targets])).map((drift) => drift.change)).toContain("missing");
    await runner.install(workspace, [...targets]);
    expect(await runner.check(workspace, [...targets])).toEqual([]);

    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    await Bun.write(`${root}/AGENTS.md`, agents.replace(/akan:agent:version \S+/, "akan:agent:version 0.0.1"));
    await Bun.write(`${root}/.claude/rules/akan/team.md`, "# Team rule\n");
    await Bun.write(`${root}/.claude/rules/akan/page.md`, "# Our page rule\n");
    expect(await runner.check(workspace, [...targets])).toEqual([]);

    const ts = `${root}/.claude/rules/akan/ts.md`;
    await Bun.write(ts, (await Bun.file(ts).text()).replace("# TypeScript Style", "# TS"));
    await Bun.write(`${root}/.claude/rules/akan/retired.md`, "---\n---\n\n<!-- akan:generated -->\n");
    await Bun.file(`${root}/.agents/skills/akan-page/SKILL.md`).delete();
    expect(await runner.check(workspace, [...targets])).toEqual([
      { path: ".claude/rules/akan/retired.md", change: "retired" },
      { path: ".claude/rules/akan/ts.md", change: "outdated" },
      { path: ".agents/skills/akan-page/SKILL.md", change: "missing" },
    ]);
    expect(await Bun.file(`${root}/.claude/rules/akan/retired.md`).exists()).toBe(true);
    expect(await Bun.file(`${root}/.agents/skills/akan-page/SKILL.md`).exists()).toBe(false);
  }, 60_000);

  test("guides removal of scaffolded samples while they exist", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
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
    const { root, workspace } = track(await createTempApp("demo"));
    const runner = new AgentRunner();

    await writeText(`${root}/apps/demo/page/_index.tsx`, "export default function Page() {\n  return null;\n}\n");

    await runner.install(workspace, ["agents-md"]);
    const agents = await Bun.file(`${root}/AGENTS.md`).text();
    expect(agents).not.toContain("Start Clean (Remove Scaffolded Samples)");
  });
});
