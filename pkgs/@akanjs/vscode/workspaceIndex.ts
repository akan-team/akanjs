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
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filePattern), excludePattern);
    if (!files.length || generation !== this.#generation) return undefined;
    const loaded = loadCore(folder.uri.fsPath, vscode.workspace.isTrusted);
    let source = loaded.source;
    let index: AkanIndex | null;
    try {
      index = await this.#fill(loaded.core, folder, files, generation);
    } catch (error) {
      if (loaded.core === bundledCore) throw error;
      this.#log.appendLine(`[akan] ${folder.name}: ${source} failed, using the bundled core: ${messageOf(error)}`);
      source = "bundled";
      index = await this.#fill(bundledCore, folder, files, generation);
    }
    if (!index) return undefined;
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, filePattern));
    const entry: FolderIndex = { folder, index, source, watcher };
    watcher.onDidCreate((uri) => this.#reloadFromDisk(uri, entry));
    watcher.onDidChange((uri) => this.#reloadFromDisk(uri, entry));
    watcher.onDidDelete((uri) => {
      entry.index.removeFile(uri.fsPath);
      this.#changed.fire();
    });
    this.#log.appendLine(
      `[akan] ${folder.name}: indexed ${index.fileCount} files in ${Date.now() - started}ms (core: ${source})`,
    );
    return entry;
  }

  async #fill(core: AkanCore, folder: vscode.WorkspaceFolder, files: vscode.Uri[], generation: number) {
    const index = new core.AkanIndex({ ts, root: folder.uri.fsPath });
    for (const [at, uri] of files.entries()) {
      if (at % filesPerYield === filesPerYield - 1) {
        await yieldToHost();
        if (generation !== this.#generation) return null;
      }
      const text = this.readText(uri.fsPath);
      if (text !== undefined) index.setFile(uri.fsPath, text);
    }
    return index;
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
    } catch {
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
