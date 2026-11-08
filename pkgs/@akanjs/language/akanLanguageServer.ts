import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AkanIndex } from "./akanIndex";
import type { Ts } from "./ast";
import { LspConnection, type LspId, type LspMessage, lspErrors } from "./lspConnection";
import type { AkanSpan } from "./moduleFacts";
import type { AkanTarget } from "./nameTable";

export interface AkanLanguageServerOptions {
  ts: Ts;
  input: Readable;
  output: Writable;
  exit: (code: number) => void;
}

interface Position {
  line: number;
  character: number;
}

interface PositionParams {
  textDocument: { uri: string };
  position: Position;
}

interface InitializeParams {
  rootUri?: string | null;
  rootPath?: string | null;
  workspaceFolders?: { uri: string }[] | null;
  capabilities?: {
    workspace?: { didChangeWatchedFiles?: { dynamicRegistration?: boolean } };
    textDocument?: { hover?: { contentFormat?: string[] } };
  };
}

interface WorkspaceRoot {
  root: string;
  index: AkanIndex;
}

const systemKinds = ["apps", "libs"];
const skippedDirs = new Set(["node_modules", "dist", ".akan"]);
const indexedPath = /^(apps|libs)\/(?!(?:.*\/)?(?:node_modules|dist|\.akan)\/).*\.tsx?$/;
const editDelayMs = 150;
const filesPerYield = 200;
const infoMessage = 3;
const unknownMethod = Symbol("unknownMethod");

const isDirectory = (dir: string) => {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const fileOf = (uri: string) => {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
};

const workspaceRootOf = (dir: string): string | null => {
  const parent = path.dirname(dir);
  if (systemKinds.some((kind) => isDirectory(path.join(dir, kind)))) return dir;
  return parent === dir ? null : workspaceRootOf(parent);
};

const sourceFilesOf = (root: string) => {
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory() && !skippedDirs.has(entry.name)) walk(at);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) found.push(at);
    }
  };
  for (const kind of systemKinds) walk(path.join(root, kind));
  return found;
};

const offsetAt = (text: string, { line, character }: Position) => {
  const breaks = [...text.matchAll(/\r\n|\r|\n/g)];
  if (line > breaks.length) return text.length;
  const start = line === 0 ? 0 : breaks[line - 1].index + breaks[line - 1][0].length;
  const end = line < breaks.length ? breaks[line].index : text.length;
  return Math.min(start + character, end);
};

const locationOf = (span: AkanSpan) => ({
  uri: pathToFileURL(span.fileName).href,
  range: {
    start: { line: span.line, character: span.character },
    end: { line: span.endLine, character: span.endCharacter },
  },
});

const escapeMarkdown = (text: string) => text.replace(/[\\`*_{}[\]()#+\-.!|<>]/g, "\\$&");

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export class AkanLanguageServer {
  readonly #ts: Ts;
  readonly #connection: LspConnection;
  readonly #exit: (code: number) => void;
  readonly #open = new Map<string, string>();
  readonly #pendingEdits = new Map<string, ReturnType<typeof setTimeout>>();
  #roots: WorkspaceRoot[] = [];
  #ready: Promise<void> = Promise.resolve();
  #watchesFiles: boolean = false;
  #hoversMarkdown: boolean = true;
  #isInitialized: boolean = false;
  #isShutdown: boolean = false;

  constructor({ ts, input, output, exit }: AkanLanguageServerOptions) {
    this.#ts = ts;
    this.#exit = exit;
    this.#connection = new LspConnection(input, output, (message) => this.#handle(message));
    input.on("end", () => this.#stop());
  }

  #handle({ id, method, params }: LspMessage) {
    if (method === undefined) return;
    if (id === undefined || id === null) this.#notified(method, params);
    else void this.#answer(id, method, params);
  }

  async #answer(id: LspId, method: string, params: unknown) {
    if (!this.#isInitialized && method !== "initialize")
      return this.#connection.fail(id, lspErrors.serverNotInitialized, "The server is not initialized yet.");
    if (this.#isShutdown) return this.#connection.fail(id, lspErrors.invalidRequest, "The server is shutting down.");
    try {
      const result = await this.#result(method, params);
      if (result === unknownMethod) this.#connection.fail(id, lspErrors.methodNotFound, `${method} is not supported.`);
      else this.#connection.respond(id, result);
    } catch (error) {
      this.#connection.fail(id, lspErrors.internalError, messageOf(error));
    }
  }

  async #result(method: string, params: unknown) {
    switch (method) {
      case "initialize":
        return this.#initialize(params as InitializeParams);
      case "shutdown":
        this.#isShutdown = true;
        return null;
      case "textDocument/definition":
        return await this.#definition(params as PositionParams);
      case "textDocument/references":
        return await this.#references(params as PositionParams);
      case "textDocument/hover":
        return await this.#hover(params as PositionParams);
      default:
        return unknownMethod;
    }
  }

  #notified(method: string, params: unknown) {
    switch (method) {
      case "initialized":
        return this.#watch();
      case "exit":
        return this.#stop();
      case "textDocument/didOpen": {
        const { textDocument } = params as { textDocument: { uri: string; text: string } };
        return this.#opened(textDocument.uri, textDocument.text);
      }
      case "textDocument/didChange": {
        const { textDocument, contentChanges } = params as {
          textDocument: { uri: string };
          contentChanges: { text: string }[];
        };
        const text = contentChanges.at(-1)?.text;
        return text === undefined ? undefined : this.#changed(textDocument.uri, text);
      }
      case "textDocument/didClose":
        return this.#closed((params as { textDocument: { uri: string } }).textDocument.uri);
      case "workspace/didChangeWatchedFiles":
        for (const { uri } of (params as { changes: { uri: string }[] }).changes) this.#changedOnDisk(uri);
        return;
      default:
        return;
    }
  }

  #initialize(params: InitializeParams) {
    this.#isInitialized = true;
    this.#watchesFiles = params.capabilities?.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
    this.#hoversMarkdown = params.capabilities?.textDocument?.hover?.contentFormat?.includes("markdown") ?? true;
    const given = params.workspaceFolders?.map((folder) => fileOf(folder.uri)) ?? [
      params.rootUri ? fileOf(params.rootUri) : (params.rootPath ?? null),
    ];
    const roots = new Set(given.flatMap((dir) => (dir ? [workspaceRootOf(path.resolve(dir))] : [])));
    this.#roots = [...roots]
      .flatMap((root) => (root ? [{ root, index: new AkanIndex({ ts: this.#ts, root }) }] : []))
      .sort((a, b) => b.root.length - a.root.length);
    this.#ready = yieldToLoop().then(() => this.#fill());
    return {
      capabilities: {
        positionEncoding: "utf-16",
        textDocumentSync: { openClose: true, change: 1 },
        definitionProvider: true,
        referencesProvider: true,
        hoverProvider: true,
      },
      serverInfo: { name: "akan-language-server" },
    };
  }

  async #fill() {
    for (const entry of this.#roots) {
      const started = Date.now();
      const failures: unknown[] = [];
      for (const [at, fileName] of sourceFilesOf(entry.root).entries()) {
        if (at % filesPerYield === filesPerYield - 1) await yieldToLoop();
        const text = this.#readText(fileName);
        try {
          if (text !== undefined) entry.index.setFile(fileName, text);
        } catch (error) {
          failures.push(error);
        }
      }
      const skipped = failures.length ? `; skipped ${failures.length}: ${messageOf(failures[0])}` : "";
      this.#log(`akan: indexed ${entry.index.fileCount} files in ${Date.now() - started}ms at ${entry.root}${skipped}`);
    }
  }

  #watch() {
    if (!this.#watchesFiles || !this.#roots.length) return;
    this.#connection.request("client/registerCapability", {
      registrations: [
        {
          id: "akan-source-files",
          method: "workspace/didChangeWatchedFiles",
          registerOptions: { watchers: [{ globPattern: "**/{apps,libs}/**/*.{ts,tsx}" }] },
        },
      ],
    });
  }

  #stop() {
    for (const timer of this.#pendingEdits.values()) clearTimeout(timer);
    this.#pendingEdits.clear();
    this.#exit(this.#isShutdown ? 0 : 1);
  }

  #log(message: string) {
    this.#connection.notify("window/logMessage", { type: infoMessage, message });
  }

  #readText = (fileName: string) => {
    const open = this.#open.get(path.resolve(fileName));
    if (open !== undefined) return open;
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  };

  #rootOf(fileName: string) {
    return this.#roots.find(({ root }) => fileName.startsWith(`${root}${path.sep}`)) ?? null;
  }

  #update(fileName: string) {
    const entry = this.#rootOf(fileName);
    const relative = entry ? path.relative(entry.root, fileName).split(path.sep).join("/") : "";
    if (!entry || !indexedPath.test(relative)) return;
    const text = this.#readText(fileName);
    try {
      if (text === undefined) entry.index.removeFile(fileName);
      else entry.index.setFile(fileName, text);
    } catch (error) {
      this.#log(`akan: ${fileName}: ${messageOf(error)}`);
    }
  }

  #flush() {
    for (const [fileName, timer] of this.#pendingEdits) {
      clearTimeout(timer);
      this.#update(fileName);
    }
    this.#pendingEdits.clear();
  }

  #opened(uri: string, text: string) {
    const fileName = fileOf(uri);
    if (!fileName) return;
    this.#open.set(path.resolve(fileName), text);
    this.#update(path.resolve(fileName));
  }

  #changed(uri: string, text: string) {
    const fileName = fileOf(uri);
    if (!fileName) return;
    const key = path.resolve(fileName);
    this.#open.set(key, text);
    clearTimeout(this.#pendingEdits.get(key));
    this.#pendingEdits.set(
      key,
      setTimeout(() => {
        this.#pendingEdits.delete(key);
        this.#update(key);
      }, editDelayMs),
    );
  }

  #closed(uri: string) {
    const fileName = fileOf(uri);
    if (!fileName) return;
    const key = path.resolve(fileName);
    clearTimeout(this.#pendingEdits.get(key));
    this.#pendingEdits.delete(key);
    this.#open.delete(key);
    this.#update(key);
  }

  #changedOnDisk(uri: string) {
    const fileName = fileOf(uri);
    if (fileName && !this.#open.has(path.resolve(fileName))) this.#update(path.resolve(fileName));
  }

  async #locate({ textDocument, position }: PositionParams) {
    await this.#ready;
    this.#flush();
    const given = fileOf(textDocument.uri);
    const fileName = given ? path.resolve(given) : null;
    const entry = fileName ? this.#rootOf(fileName) : null;
    const text = fileName ? this.#readText(fileName) : undefined;
    if (!fileName || !entry || text === undefined) return null;
    return { entry, fileName, text, offset: offsetAt(text, position) };
  }

  async #definition(params: PositionParams) {
    const at = await this.#locate(params);
    return at?.entry.index.definitionAt(at.fileName, at.text, at.offset).map((target) => locationOf(target.span));
  }

  async #references(params: PositionParams) {
    const at = await this.#locate(params);
    return at?.entry.index.referencesAt(at.fileName, at.offset, this.#readText).map(locationOf);
  }

  async #hover(params: PositionParams) {
    const at = await this.#locate(params);
    const hover = at?.entry.index.hoverAt(at.fileName, at.text, at.offset);
    if (!at || !hover) return null;
    const lineOf = (target: AkanTarget) => {
      const summary = [target.label, ...target.detail].join(" · ");
      const where = `${path.relative(at.entry.root, target.span.fileName).split(path.sep).join("/")}:${target.span.line + 1}`;
      return this.#hoversMarkdown
        ? `**akan** · ${escapeMarkdown(summary)} — \`${where}\``
        : `akan · ${summary} — ${where}`;
    };
    return {
      contents: {
        kind: this.#hoversMarkdown ? "markdown" : "plaintext",
        value: hover.targets.map(lineOf).join("\n\n"),
      },
    };
  }
}
