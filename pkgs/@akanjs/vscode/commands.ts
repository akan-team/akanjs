import path from "node:path";
import * as vscode from "vscode";
import { AkanCli, type AkanRun, type VerifyResult } from "./akanCli";
import { type ModuleFolder, ModuleLayout } from "./moduleLayout";
import { StudioPanel } from "./studioPanel";
import { StudioView } from "./studioView";

interface WorkflowInputSpec {
  type: string;
  required?: boolean;
  description: string;
  allowedValues?: string[];
}

interface WorkflowDiagnostic {
  severity: "warning" | "error";
  message: string;
}

interface WorkflowPlan {
  diagnostics: WorkflowDiagnostic[];
  predictedChanges: { target: string; action: string }[];
}

interface WorkflowApplyReport {
  status: "passed" | "failed";
  changedFiles: { path: string }[];
  diagnostics: WorkflowDiagnostic[];
}

interface ModuleTarget {
  root?: string;
  app: string;
  module: string;
}

const writingActions = new Set(["create", "modify"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const errorsOf = (diagnostics: WorkflowDiagnostic[]) =>
  diagnostics.filter((diagnostic) => diagnostic.severity === "error").map((diagnostic) => diagnostic.message);

const reporterOf = (log: vscode.OutputChannel) => (result: AkanRun | null, command: string) => {
  if (!result) return null;
  const report = AkanCli.jsonOf(result.stdout);
  const failure = AkanCli.failureOf(report);
  if (failure) {
    log.appendLine(`[akan] ${command} ${failure.code}: ${failure.error}`);
    void vscode.window.showErrorMessage(vscode.l10n.t("akan {0} failed: {1}", command, failure.error));
    return null;
  }
  if (isRecord(report)) return report;
  log.appendLine(result.stdout.trimEnd());
  log.show(true);
  void vscode.window.showErrorMessage(vscode.l10n.t("akan {0} printed no report. See the Akan.js output.", command));
  return null;
};

export const registerCommands = (log: vscode.OutputChannel): vscode.Disposable[] => {
  const problems = vscode.languages.createDiagnosticCollection("akan");

  const folderOf = async () => {
    const active = vscode.window.activeTextEditor?.document.uri;
    const folder = active ? vscode.workspace.getWorkspaceFolder(active) : undefined;
    if (folder) return folder;
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick();
  };

  const cliOf = async (root?: string) => {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        vscode.l10n.t("Akan commands run the workspace's CLI, so they need a trusted workspace."),
      );
      return null;
    }
    const folderPath = root ?? (await folderOf())?.uri.fsPath;
    if (!folderPath) return null;
    const cli = AkanCli.of(folderPath);
    if (!cli)
      void vscode.window.showErrorMessage(
        vscode.l10n.t("{0} has no akan CLI. Install @akanjs/cli.", path.basename(folderPath)),
      );
    return cli;
  };

  const run = (cli: AkanCli, title: string, args: string[]) =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      async (_progress, token): Promise<AkanRun | null> => {
        const abort = new AbortController();
        const cancel = token.onCancellationRequested(() => abort.abort());
        log.appendLine(`[akan] ${cli.root}: ${[...cli.command, ...args].join(" ")}`);
        try {
          const result = await cli.run(args, abort.signal);
          if (result.stderr.trim()) log.appendLine(result.stderr.trimEnd());
          return result;
        } catch (error) {
          if (!abort.signal.aborted) {
            log.appendLine(`[akan] ${error instanceof Error ? error.message : String(error)}`);
            void vscode.window.showErrorMessage(vscode.l10n.t("Could not run bun. Is it on the PATH?"));
          }
          return null;
        } finally {
          cancel.dispose();
        }
      },
    );

  const reportOf = reporterOf(log);

  const verify = async (target?: string, root?: string) => {
    const cli = await cliOf(root);
    if (!cli) return;
    await vscode.workspace.saveAll(false);
    const active = vscode.window.activeTextEditor?.document.uri;
    const system = target ?? (active ? AkanCli.placeOf(cli.root, active.fsPath).system : null);
    const title = system ? vscode.l10n.t("akan verify {0}", system) : vscode.l10n.t("akan verify (changes)");
    const report = reportOf(
      await run(cli, title, ["verify", ...(system ? [system] : []), "--format", "json"]),
      "verify",
    );
    if (!report) return;
    const result = report as unknown as VerifyResult;
    problems.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const entry of result.diagnostics) {
      if (!entry.file) {
        log.appendLine(`[akan] ${entry.step} ${entry.code}: ${entry.message}`);
        continue;
      }
      const position = new vscode.Position(Math.max(entry.line - 1, 0), Math.max(entry.col - 1, 0));
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(position, position),
        entry.fix ? `${entry.message}\n${entry.fix}` : entry.message,
        entry.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = `akan ${entry.step}`;
      diagnostic.code = entry.code;
      const fileName = path.join(cli.root, entry.file);
      byFile.set(fileName, [...(byFile.get(fileName) ?? []), diagnostic]);
    }
    for (const [fileName, diagnostics] of byFile) problems.set(vscode.Uri.file(fileName), diagnostics);
    const targets = result.targets.join(", ") || vscode.l10n.t("nothing changed");
    const errors = result.diagnostics.filter((entry) => entry.severity === "error").length;
    if (result.ok) {
      void vscode.window.showInformationMessage(vscode.l10n.t("verify ok · {0}", targets));
      return;
    }
    const show = vscode.l10n.t("Show Problems");
    const picked = await vscode.window.showWarningMessage(
      vscode.l10n.t("verify failed · {0} · {1} errors", targets, errors),
      show,
    );
    if (picked === show) await vscode.commands.executeCommand("workbench.actions.view.problems");
  };

  const askInput = async (cli: AkanCli, name: string, spec: WorkflowInputSpec, preset: string | null) => {
    const optional = !spec.required;
    if (name === "app" || spec.allowedValues || spec.type === "boolean") {
      const choices =
        name === "app"
          ? AkanCli.systemsOf(cli.root).sort((a, b) => Number(b === preset) - Number(a === preset))
          : (spec.allowedValues ?? ["true", "false"]);
      const picked = await vscode.window.showQuickPick(choices, { title: name, placeHolder: spec.description });
      if (picked === undefined) return undefined;
      return spec.type === "boolean" ? picked === "true" : picked;
    }
    return await vscode.window.showInputBox({
      title: name,
      prompt: spec.description,
      value: preset ?? "",
      ignoreFocusOut: true,
      validateInput: (value) => (optional || value.trim() ? null : vscode.l10n.t("{0} is required", name)),
    });
  };

  const askInputs = async (
    cli: AkanCli,
    specs: Record<string, WorkflowInputSpec>,
    given: Record<string, string>,
  ): Promise<Record<string, string | boolean> | null> => {
    const active = vscode.window.activeTextEditor?.document.uri;
    const place = active ? AkanCli.placeOf(cli.root, active.fsPath) : { system: null, module: null };
    const presets: Partial<Record<string, string | null>> = { app: place.system, module: place.module };
    const entries = StudioView.inputsToAsk(specs, given);
    const optional = entries.filter(([, spec]) => !spec.required);
    const values: Record<string, string | boolean> = { ...given };
    for (const [name, spec] of entries.filter(([, spec]) => spec.required)) {
      const value = await askInput(cli, name, spec, presets[name] ?? null);
      if (value === undefined) return null;
      values[name] = typeof value === "string" ? value.trim() : value;
    }
    if (!optional.length) return values;
    const picked = await vscode.window.showQuickPick(
      optional.map(([name, spec]) => ({ label: name, detail: spec.description })),
      {
        canPickMany: true,
        title: vscode.l10n.t("Optional inputs"),
        placeHolder: vscode.l10n.t("Pick any to set, or press Enter"),
      },
    );
    if (!picked) return null;
    for (const { label } of picked) {
      const spec = specs[label];
      if (!spec) continue;
      const value = await askInput(cli, label, spec, presets[label] ?? null);
      if (value === undefined) return null;
      values[label] = typeof value === "string" ? value.trim() : value;
    }
    return values;
  };

  let isWorkflowRunning = false;
  const runWorkflow = async (name?: string, given: Record<string, string> = {}, root?: string): Promise<boolean> => {
    if (isWorkflowRunning) {
      void vscode.window.showInformationMessage(vscode.l10n.t("Another Akan workflow is still running."));
      return false;
    }
    isWorkflowRunning = true;
    try {
      return await runWorkflowOnce(name, given, root);
    } finally {
      isWorkflowRunning = false;
    }
  };

  const runWorkflowOnce = async (name: string | undefined, given: Record<string, string>, root?: string) => {
    const cli = await cliOf(root);
    if (!cli) return false;
    let workflow = name;
    if (!workflow) {
      const listed = reportOf(
        await run(cli, vscode.l10n.t("Reading workflows"), ["workflow", "list", "--format", "json"]),
        "workflow list",
      );
      const workflows = Array.isArray(listed?.workflows)
        ? (listed.workflows as { name: string; description: string }[])
        : [];
      workflow = (
        await vscode.window.showQuickPick(
          workflows.map((entry) => ({ label: entry.name, detail: entry.description })),
          { title: vscode.l10n.t("Run an Akan workflow") },
        )
      )?.label;
    }
    if (!workflow) return false;
    const spec = reportOf(
      await run(cli, vscode.l10n.t("Reading {0}", workflow), ["workflow", "explain", workflow, "--format", "json"]),
      "workflow explain",
    );
    if (!spec || !isRecord(spec.inputs)) return false;
    const inputs = await askInputs(cli, spec.inputs as Record<string, WorkflowInputSpec>, given);
    if (!inputs) return false;

    const planPath = path.join(".akan", "workflows", "plans", `editor-${workflow}.json`);
    const planArgs = ["workflow", "plan", workflow, ...AkanCli.argsOf(inputs), "--format", "json", "--out", planPath];
    const planned = reportOf(await run(cli, vscode.l10n.t("Planning {0}", workflow), planArgs), "workflow plan");
    if (!planned) return false;
    const plan = planned as unknown as WorkflowPlan;
    const planErrors = errorsOf(plan.diagnostics);
    if (planErrors.length) {
      void vscode.window.showErrorMessage(planErrors.join(" "));
      return false;
    }
    const writes = plan.predictedChanges.filter((change) => writingActions.has(change.action));
    const applyLabel = vscode.l10n.t("Apply");
    const inputLine = Object.entries(inputs)
      .map(([input, value]) => `${input}=${String(value)}`)
      .join(" ");
    const confirmed = await vscode.window.showInformationMessage(
      vscode.l10n.t("Apply {0}?", workflow),
      { modal: true, detail: [inputLine, ...writes.map((change) => `${change.action} ${change.target}`)].join("\n") },
      applyLabel,
    );
    if (confirmed !== applyLabel) return false;

    const applied = reportOf(
      await run(cli, vscode.l10n.t("Applying {0}", workflow), ["workflow", "apply", planPath, "--format", "json"]),
      "workflow apply",
    );
    if (!applied) return false;
    const report = applied as unknown as WorkflowApplyReport;
    for (const file of report.changedFiles) log.appendLine(`[akan] ${workflow}: ${file.path}`);
    if (report.status !== "passed") {
      void vscode.window.showErrorMessage(
        errorsOf(report.diagnostics).join(" ") || vscode.l10n.t("{0} failed.", workflow),
      );
      return false;
    }
    const verifyLabel = vscode.l10n.t("Verify");
    void vscode.window
      .showInformationMessage(
        vscode.l10n.t(
          "{0} changed {1} files. Verify syncs the generated files and checks them.",
          workflow,
          report.changedFiles.length,
        ),
        verifyLabel,
      )
      .then((picked) => {
        if (picked === verifyLabel) void verify(typeof inputs.app === "string" ? inputs.app : undefined, cli.root);
      });
    return true;
  };

  const openStudio = async ({
    app: appName,
    module: moduleName,
    view,
  }: {
    app?: string;
    module?: string | null;
    view?: "changes";
  } = {}) => {
    const cli = await cliOf();
    if (!cli) return false;
    const active = vscode.window.activeTextEditor?.document.uri;
    const place = active ? AkanCli.placeOf(cli.root, active.fsPath) : { system: null, module: null };
    const apps = AkanCli.systemsOf(cli.root, ["apps"]);
    const app =
      appName ??
      (place.system && apps.includes(place.system)
        ? place.system
        : apps.length === 1
          ? apps[0]
          : await vscode.window.showQuickPick(apps, { title: vscode.l10n.t("Open Akan Studio for") }));
    if (!app) return false;
    const module =
      moduleName !== undefined ? moduleName : view === "changes" ? null : StudioView.moduleOf(place.module);
    const editor = vscode.env.uriScheme === "cursor" ? "cursor" : "vscode";
    const args = [
      "studio",
      app,
      "--editor",
      editor,
      "--format",
      "json",
      "--view",
      view ?? (module ? "signals" : "erd"),
    ];
    if (module) args.push("--module", module);
    const result = await run(cli, vscode.l10n.t("Opening Akan Studio for {0}", app), args);
    if (!result) return false;
    const report = AkanCli.jsonOf(result.stdout);
    if (isRecord(report) && typeof report.url === "string")
      return await StudioPanel.show(cli.root, app, report.url, {
        runWorkflow: ({ workflow, inputs }) => runWorkflow(workflow, inputs, cli.root),
        openModule: (target, revealStudio) => openModule({ ...target, root: cli.root }, revealStudio),
      });
    log.appendLine(result.stdout.trimEnd());
    const reason =
      AkanCli.failureOf(report)?.error ??
      (result.stdout.trim().split("\n").at(-1) || vscode.l10n.t("akan studio failed."));
    if (!result.stdout.includes("No dev server answers")) {
      void vscode.window.showErrorMessage(reason);
      return false;
    }
    const start = vscode.l10n.t("Start {0}", app);
    if ((await vscode.window.showErrorMessage(reason, start)) !== start) return false;
    const terminal = vscode.window.createTerminal({ name: `akan start ${app}`, cwd: cli.root });
    terminal.sendText([...cli.command, "start", app].map(AkanCli.shellArgOf).join(" "));
    terminal.show();
    return false;
  };

  const pickModule = async (root: string) => {
    const picked = await vscode.window.showQuickPick(
      ModuleLayout.modulesOf(root).map((folder) => ({
        label: folder.name,
        description: path.relative(root, folder.dir),
        folder,
      })),
      { title: vscode.l10n.t("Open which module side by side"), matchOnDescription: true },
    );
    return picked?.folder ?? null;
  };

  const openModuleOnce = async (target?: ModuleTarget, revealStudio?: (column: number) => void) => {
    const root = target?.root ?? (await folderOf())?.uri.fsPath;
    if (!root) return false;
    const active = vscode.window.activeTextEditor?.document.uri;
    const folder: ModuleFolder | null = target
      ? ModuleLayout.folderFor(root, target.app, target.module)
      : ((active && ModuleLayout.folderOf(root, active.fsPath)) ?? (await pickModule(root)));
    if (!folder) {
      if (target)
        void vscode.window.showErrorMessage(vscode.l10n.t("No module {0} in {1}.", target.module, target.app));
      return false;
    }
    const files = ModuleLayout.filesIn(folder);
    if (!files.length) {
      void vscode.window.showErrorMessage(vscode.l10n.t("{0} has no module files to open.", folder.name));
      return false;
    }
    const grid = ModuleLayout.gridOf(files.length, { besideStudio: !!revealStudio });
    await vscode.commands.executeCommand("vscode.setEditorLayout", grid);
    for (const [idx, file] of files.entries())
      await vscode.window.showTextDocument(vscode.Uri.file(file), {
        viewColumn: idx + 1,
        preview: false,
        preserveFocus: idx > 0,
      });
    //? Moving Studio first would empty its old group, which VS Code closes, shifting every later column onto Studio.
    revealStudio?.(files.length + 1);
    return true;
  };

  let isModuleOpening = false;
  const openModule = async (target?: ModuleTarget, revealStudio?: (column: number) => void) => {
    if (isModuleOpening) return false;
    isModuleOpening = true;
    try {
      return await openModuleOnce(target, revealStudio);
    } finally {
      isModuleOpening = false;
    }
  };

  return [
    problems,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length) problems.delete(event.document.uri);
    }),
    vscode.commands.registerCommand("akan.verify", () => verify()),
    vscode.commands.registerCommand("akan.runWorkflow", (name?: unknown) =>
      runWorkflow(typeof name === "string" ? name : undefined),
    ),
    vscode.commands.registerCommand("akan.createModule", () => runWorkflow("create-module")),
    vscode.commands.registerCommand("akan.addField", () => runWorkflow("add-field")),
    vscode.commands.registerCommand("akan.openStudio", (options?: unknown) =>
      openStudio({
        app: isRecord(options) && typeof options.app === "string" ? options.app : undefined,
        module:
          isRecord(options) && (typeof options.module === "string" || options.module === null)
            ? options.module
            : undefined,
      }),
    ),
    vscode.commands.registerCommand("akan.openModule", (options?: unknown) =>
      openModule(
        isRecord(options) && typeof options.app === "string" && typeof options.module === "string"
          ? { app: options.app, module: options.module }
          : undefined,
      ),
    ),
    vscode.commands.registerCommand("akan.openChangeMap", (options?: unknown) =>
      openStudio({
        app: isRecord(options) && typeof options.app === "string" ? options.app : undefined,
        view: "changes",
      }),
    ),
  ];
};
