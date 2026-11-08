import { readFileSync } from "node:fs";
import path from "node:path";
import type { AkanIndex } from "@akanjs/language";
import ts from "typescript";
import * as vscode from "vscode";
import { type AkanCore, bundledCore, loadCore } from "./coreLoader";

const filePattern = "{apps,libs}/**/*.{ts,tsx}";
const excludePattern = "**/{node_modules,dist,.akan}/**";
const indexedPath = /^(apps|libs)\/(?!(?:.*\/)?(?:node_modules|dist|\.akan)\/).*\.tsx?$/;
const editDelayMs = 150;
const filesPerYield = 200;

export interface FolderIndex {
  folder: vscode.WorkspaceFolder;
  index: AkanIndex;
  source: string;
  watcher: vscode.FileSystemWatcher;
}

const relativeIn = (folder: vscode.WorkspaceFolder, uri: vscode.Uri) => {
  const relative = path.relative(folder.uri.fsPath, uri.fsPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
};

const messageOf = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error));

const yieldToHost = () => new Promise<void>((resolve) => setImmediate(resolve));

export class WorkspaceIndex implements vscode.Disposable {
  #folders = new Map<string, FolderIndex>();
  #generation = 0;
  readonly #pendingEdits = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #disposables: vscode.Disposable[] = [];
  readonly #log: vscode.OutputChannel;
  readonly #changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.#changed.event;

  constructor(log: vscode.OutputChannel) {
    this.#log = log;
    this.#disposables.push(
      this.#changed,
      vscode.workspace.onDidChangeTextDocument((event) => this.#scheduleEdit(event.document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.#reloadFromDisk(document.uri)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.rebuild()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => void this.rebuild()),
    );
  }

  //? The innermost indexed folder answers, so a nested folder without its own apps/libs falls back to its parent.
  folderOf(uri: vscode.Uri) {
    if (uri.scheme !== "file") return undefined;
    let found: FolderIndex | undefined;
    for (const entry of this.#folders.values())
      if (
        relativeIn(entry.folder, uri) !== null &&
        (!found || entry.folder.uri.fsPath.length > found.folder.uri.fsPath.length)
      )
        found = entry;
    return found;
  }

  readText = (fileName: string) => {
    const target = vscode.Uri.file(fileName).toString();
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === target);
    if (open) return open.getText();
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  };

  async rebuild() {
    const generation = ++this.#generation;
    const built = new Map<string, FolderIndex>();
    const discard = () => {
      for (const entry of built.values()) entry.watcher.dispose();
    };
    try {
      for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const entry = await this.#indexFolder(folder, generation);
        if (entry) built.set(folder.uri.toString(), entry);
        if (generation !== this.#generation) return discard();
      }
    } catch (error) {
      discard();
      this.#log.appendLine(`[akan] indexing failed: ${messageOf(error)}`);
      return;
    }
    for (const entry of this.#folders.values()) entry.watcher.dispose();
    this.#folders = built;
    for (const document of vscode.workspace.textDocuments)
      if (document.isDirty) this.#update(document.uri, document.getText());
    this.#changed.fire();
  }

  async #indexFolder(folder: vscode.WorkspaceFolder, generation: number) {
    const started = Date.now();
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, filePattern));
    const touched = new Map<string, vscode.Uri>();
    let entry: FolderIndex | undefined;
    const onDisk = (uri: vscode.Uri) => {
      if (entry) this.#reloadFromDisk(uri, entry);
      else touched.set(uri.toString(), uri);
    };
    watcher.onDidCreate(onDisk);
    watcher.onDidChange(onDisk);
    watcher.onDidDelete(onDisk);
    try {
      const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filePattern), excludePattern);
      if (!files.length || generation !== this.#generation) {
        watcher.dispose();
        return undefined;
      }
      const loaded = loadCore(folder.uri.fsPath, vscode.workspace.isTrusted);
      let filled = await this.#fill(loaded.core, folder, files, generation).catch((error: unknown) => ({ error }));
      let source = loaded.source;
      if (loaded.core !== bundledCore && filled && ("error" in filled || filled.failures.length)) {
        const reason = "error" in filled ? filled.error : filled.failures[0];
        this.#log.appendLine(`[akan] ${folder.name}: ${source} failed, using the bundled core: ${messageOf(reason)}`);
        source = "bundled";
        filled = await this.#fill(bundledCore, folder, files, generation);
      }
      if (filled && "error" in filled) throw filled.error;
      if (!filled) {
        watcher.dispose();
        return undefined;
      }
      const { index, failures } = filled;
      if (failures.length)
        this.#log.appendLine(`[akan] ${folder.name}: skipped ${failures.length} files: ${messageOf(failures[0])}`);
      entry = { folder, index, source, watcher };
      for (const uri of touched.values()) this.#reloadFromDisk(uri, entry);
      this.#log.appendLine(
        `[akan] ${folder.name}: indexed ${index.fileCount} files in ${Date.now() - started}ms (core: ${source})`,
      );
      return entry;
    } catch (error) {
      watcher.dispose();
      throw error;
    }
  }

  async #fill(core: AkanCore, folder: vscode.WorkspaceFolder, files: vscode.Uri[], generation: number) {
    const index = new core.AkanIndex({ ts, root: folder.uri.fsPath });
    const failures: unknown[] = [];
    for (const [at, uri] of files.entries()) {
      if (at % filesPerYield === filesPerYield - 1) {
        await yieldToHost();
        if (generation !== this.#generation) return null;
      }
      const text = this.readText(uri.fsPath);
      try {
        if (text !== undefined) index.setFile(uri.fsPath, text);
      } catch (error) {
        failures.push(error);
      }
    }
    return { index, failures };
  }

  #indexedEntryOf(uri: vscode.Uri, entry = this.folderOf(uri)) {
    const relative = entry ? relativeIn(entry.folder, uri) : null;
    return uri.scheme === "file" && relative !== null && indexedPath.test(relative) ? entry : undefined;
  }

  #update(uri: vscode.Uri, text: string | undefined, entry = this.#indexedEntryOf(uri)) {
    if (!entry) return;
    try {
      if (text === undefined) entry.index.removeFile(uri.fsPath);
      else entry.index.setFile(uri.fsPath, text);
    } catch (error) {
      this.#log.appendLine(`[akan] ${uri.fsPath}: ${messageOf(error)}`);
    }
  }

  #scheduleEdit(document: vscode.TextDocument) {
    if (!this.#indexedEntryOf(document.uri)) return;
    const key = document.uri.toString();
    clearTimeout(this.#pendingEdits.get(key));
    this.#pendingEdits.set(
      key,
      setTimeout(() => {
        this.#pendingEdits.delete(key);
        this.#update(document.uri, document.getText());
        this.#changed.fire();
      }, editDelayMs),
    );
  }

  #reloadFromDisk(uri: vscode.Uri, owner?: FolderIndex) {
    const entry = this.#indexedEntryOf(uri, owner ?? this.folderOf(uri));
    if (!entry) return;
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open?.isDirty) return;
    let text: string | undefined;
    try {
      text = readFileSync(uri.fsPath, "utf8");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) return;
      text = undefined;
    }
    this.#update(uri, text, entry);
    this.#changed.fire();
  }

  dispose() {
    this.#generation++;
    for (const timer of this.#pendingEdits.values()) clearTimeout(timer);
    for (const entry of this.#folders.values()) entry.watcher.dispose();
    for (const disposable of this.#disposables) disposable.dispose();
  }
}
