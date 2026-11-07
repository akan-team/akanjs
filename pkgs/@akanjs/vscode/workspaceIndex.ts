import { readFileSync } from "node:fs";
import type { AkanIndex } from "@akanjs/language";
import ts from "typescript";
import * as vscode from "vscode";
import { loadCore } from "./coreLoader";

const filePattern = "{apps,libs}/**/*.{ts,tsx}";
const excludePattern = "**/{node_modules,dist,.akan}/**";
const editDelayMs = 150;

export interface FolderIndex {
  folder: vscode.WorkspaceFolder;
  index: AkanIndex;
  source: string;
  watcher: vscode.FileSystemWatcher;
}

export class WorkspaceIndex implements vscode.Disposable {
  readonly #folders = new Map<string, FolderIndex>();
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

  folderOf(uri: vscode.Uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder ? this.#folders.get(folder.uri.toString()) : undefined;
  }

  readText = (fileName: string) => {
    const open = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === fileName);
    if (open) return open.getText();
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  };

  async rebuild() {
    for (const folder of this.#folders.values()) folder.watcher.dispose();
    this.#folders.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) await this.#indexFolder(folder);
    this.#changed.fire();
  }

  async #indexFolder(folder: vscode.WorkspaceFolder) {
    const started = Date.now();
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filePattern), excludePattern);
    if (!files.length) return;
    const { core, source } = loadCore(folder.uri.fsPath, vscode.workspace.isTrusted);
    const index = new core.AkanIndex({ ts, root: folder.uri.fsPath });
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, filePattern));
    this.#folders.set(folder.uri.toString(), { folder, index, source, watcher });
    for (const uri of files) {
      const text = this.readText(uri.fsPath);
      if (text !== undefined) index.setFile(uri.fsPath, text);
    }
    watcher.onDidCreate((uri) => this.#reloadFromDisk(uri));
    watcher.onDidChange((uri) => this.#reloadFromDisk(uri));
    watcher.onDidDelete((uri) => {
      this.folderOf(uri)?.index.removeFile(uri.fsPath);
      this.#changed.fire();
    });
    this.#log.appendLine(
      `[akan] ${folder.name}: indexed ${index.fileCount} files in ${Date.now() - started}ms (core: ${source})`,
    );
  }

  #isIndexed(uri: vscode.Uri) {
    return (
      uri.scheme === "file" && /\.tsx?$/.test(uri.fsPath) && !/[\\/](node_modules|dist|\.akan)[\\/]/.test(uri.fsPath)
    );
  }

  #scheduleEdit(document: vscode.TextDocument) {
    if (!this.#isIndexed(document.uri) || !this.folderOf(document.uri)) return;
    const key = document.uri.toString();
    clearTimeout(this.#pendingEdits.get(key));
    this.#pendingEdits.set(
      key,
      setTimeout(() => {
        this.#pendingEdits.delete(key);
        this.folderOf(document.uri)?.index.setFile(document.uri.fsPath, document.getText());
        this.#changed.fire();
      }, editDelayMs),
    );
  }

  #reloadFromDisk(uri: vscode.Uri) {
    if (!this.#isIndexed(uri)) return;
    const folder = this.folderOf(uri);
    if (!folder) return;
    const open = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (open?.isDirty) return;
    try {
      folder.index.setFile(uri.fsPath, readFileSync(uri.fsPath, "utf8"));
    } catch {
      folder.index.removeFile(uri.fsPath);
    }
    this.#changed.fire();
  }

  dispose() {
    for (const timer of this.#pendingEdits.values()) clearTimeout(timer);
    for (const folder of this.#folders.values()) folder.watcher.dispose();
    for (const disposable of this.#disposables) disposable.dispose();
  }
}
