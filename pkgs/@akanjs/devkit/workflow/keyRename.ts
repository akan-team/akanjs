import { readFile } from "node:fs/promises";
import path from "node:path";
import { AkanIndex, type AkanRenameEdit } from "@akanjs/language";
import ts from "typescript";
import type { Workspace } from "../commandDecorators";
import { resolveWorkflowSys } from "./executor";
import { getSysRoot, moduleSourcePaths } from "./source";
import type { RenameKeyInput, ScaffoldFile, WorkflowDiagnostic } from "./types";

const indexedPath = /^(apps|libs)\/(?!(?:.*\/)?(?:node_modules|dist|\.akan)\/).*\.tsx?$/;
const keyPattern = /^[a-z][A-Za-z0-9]*$/;
const slashed = (fileName: string) => fileName.replace(/\\/g, "/");

const refuse = (code: string, input: string, message: string) => ({
  diagnostics: [{ severity: "error", code, input, message }] satisfies WorkflowDiagnostic[],
  files: [] as ScaffoldFile[],
});

export class KeyRename {
  static async build(workspace: Workspace, input: RenameKeyInput) {
    const sys = await resolveWorkflowSys(workspace, input.app);
    if (!sys) return refuse("workflow-target-missing", "app", `No app or library named ${input.app ?? ""}.`);
    if (!input.module) return refuse("workflow-input-missing", "module", "Module name is required.");
    if (!input.slice === !input.query)
      return refuse("rename-key-source-invalid", "slice", "Name exactly one key to rename, as slice or as query.");
    const family = input.slice ? "slice" : "query";
    const from = input.slice ?? input.query ?? "";
    if (!input.to || !keyPattern.test(input.to))
      return refuse(
        "rename-key-name-invalid",
        "to",
        `New key "${input.to ?? ""}" must be camelCase (inFeed, byTitle).`,
      );
    if (input.to === from) return refuse("rename-key-name-same", "to", `New key is the same as ${from}.`);

    const root = workspace.workspaceRoot;
    const paths = moduleSourcePaths(input.module);
    const sourceRelative = `${getSysRoot(sys)}/${family === "slice" ? paths.signal : paths.document}`;
    const sourcePath = slashed(path.join(root, sourceRelative));
    const texts = new Map<string, string>();
    const index = new AkanIndex({ ts, root });
    for (const relative of await workspace.getAllFiles("{apps,libs}/**/*.{ts,tsx}")) {
      if (!indexedPath.test(slashed(relative))) continue;
      const fileName = slashed(path.join(root, relative));
      const text = await readFile(fileName, "utf8");
      texts.set(fileName, text);
      index.setFile(fileName, text);
    }

    const keys = index.sourceKeysOf(sourcePath).filter((key) => key.family === family);
    const source = keys.find((key) => key.sourceKey === from);
    if (!source)
      return refuse("rename-key-source-missing", family, `${sourceRelative} declares no ${family} key ${from}.`);
    if (keys.some((key) => key.sourceKey === input.to))
      return refuse("rename-key-exists", "to", `${sourceRelative} already declares the ${family} key ${input.to}.`);
    const edits = index.renameAt(sourcePath, source.span.start, input.to, (fileName) => texts.get(fileName)) ?? [];

    const byFile = new Map<string, AkanRenameEdit[]>();
    for (const edit of edits) byFile.set(edit.span.fileName, [...(byFile.get(edit.span.fileName) ?? []), edit]);
    const files: ScaffoldFile[] = [...byFile].map(([fileName, fileEdits]) => {
      let content = texts.get(fileName) ?? "";
      for (const { span, newText } of fileEdits.toSorted((a, b) => b.span.start - a.span.start))
        content = content.slice(0, span.start) + newText + content.slice(span.end);
      const names = fileEdits.length === 1 ? "1 name changes" : `${fileEdits.length} names change`;
      return {
        path: slashed(path.relative(root, fileName)),
        content,
        action: "modify",
        reason: `${names} with the ${family} key ${from} → ${input.to}.`,
      };
    });
    return { diagnostics: [] as WorkflowDiagnostic[], files: files.toSorted((a, b) => a.path.localeCompare(b.path)) };
  }

  static targetsOf(files: readonly { path: string }[]) {
    return [...new Set(files.map((file) => file.path.split("/").slice(0, 2).join("/")))];
  }
}
