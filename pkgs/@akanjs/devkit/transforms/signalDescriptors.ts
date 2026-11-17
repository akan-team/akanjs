import path from "node:path";
import type { BunPlugin } from "bun";

type ScopeDescriptors = Record<string, string>;

interface ScopeSignals {
  //? Every name the scope's signal holds, with or without a literal.
  names: string[];
  literals: ScopeDescriptors;
}

interface ScopeRead {
  file: string;
  names?: string[];
  read?: ScopeDescriptors;
  failure?: string;
}

export interface SignalDescriptorsOptions {
  onUnread?: (reason: string) => void;
  timeoutMs?: number;
  //? The pieces a scope's `lib/useClient.ts` takes descriptors from, so it holds none of theirs again.
  takenFromPieces?: (absPath: string) => string[] | null;
}

//* Bun runs a macro module again on each bundler thread, so a build of many pieces reads each scope's signal once here.
export class SignalDescriptors {
  static readonly readTimeoutMs = 60_000;
  static readonly #pieceFile = /[\\/]lib[\\/]__client[\\/][^\\/]+\.fetch\.ts$/;
  static readonly #wholeFile = /[\\/]lib[\\/]useClient\.ts$/;
  static readonly #macroImport = 'import { getSerializedSignalOf } from "../sig" with { type: "macro" };';
  static readonly #macroCall = /\bgetSerializedSignalOf\("([^"\\]+)"\)/g;
  static readonly #wholeImport = 'import { getSerializedSignal } from "./sig" with { type: "macro" };';
  static readonly #wholeCall = "getSerializedSignal()";
  readonly #workspaceRoot: string;
  readonly #sigFiles: string[];
  readonly #onUnread: (reason: string) => void;
  readonly #timeoutMs: number;
  readonly #takenFromPieces: (absPath: string) => string[] | null;
  readonly #reads = new Map<string, Promise<ScopeSignals | null>>();
  #env: Record<string, string> = {};

  //? In a process of its own: a module imported into this one stays cached after its file changes.
  //? JSON drops undefined, -0, NaN and holes, and a `"__proto__"` key sets a prototype: such a name keeps its macro.
  static #readScript(sigFiles: string[]) {
    return `
process.on("disconnect", () => process.exit(1));
const send = (message) => new Promise((resolve) => process.send(message, undefined, undefined, resolve));
const literalOf = (value) => {
  try {
    const text = JSON.stringify(value);
    return Bun.deepEquals(JSON.parse(text), value, true) && !text.includes('"__proto__":') ? text : undefined;
  } catch {
    return undefined;
  }
};
for (const file of ${JSON.stringify(sigFiles)}) {
  try {
    const { fetch, getSerializedSignalOf } = await import(file);
    const names = ["base", ...Object.keys(fetch.ownSerializedSignal)];
    const literals = names.map((name) => [name, literalOf(getSerializedSignalOf(name))]);
    await send({ file, names, read: Object.fromEntries(literals.filter(([, literal]) => literal !== undefined)) });
  } catch (error) {
    await send({ file, failure: String(error?.message ?? error) });
  }
}
process.exit(0);
`;
  }

  //? A macro module sees the build's `define`, so the process reading the signals gets each `process.env.<KEY>` of it.
  static #envOf(define: Record<string, string> = {}): Record<string, string> {
    return Object.fromEntries(
      Object.entries(define).flatMap(([key, value]) => {
        if (!key.startsWith("process.env.")) return [];
        try {
          const parsed: unknown = JSON.parse(value);
          return typeof parsed === "string" ? [[key.slice("process.env.".length), parsed]] : [];
        } catch {
          return [];
        }
      }),
    );
  }

  constructor(
    workspaceRoot: string,
    scopes: readonly string[],
    {
      onUnread = () => undefined,
      timeoutMs = SignalDescriptors.readTimeoutMs,
      takenFromPieces = () => null,
    }: SignalDescriptorsOptions = {},
  ) {
    this.#takenFromPieces = takenFromPieces;
    this.#workspaceRoot = workspaceRoot;
    this.#sigFiles = scopes.map((scope) => path.join(workspaceRoot, scope, "lib/sig.ts"));
    this.#onUnread = onUnread;
    this.#timeoutMs = timeoutMs;
  }

  get plugin(): BunPlugin {
    return {
      name: "signal-descriptors",
      setup: (build) => {
        this.#env = SignalDescriptors.#envOf(build.config.define);
        build.onLoad({ filter: SignalDescriptors.#pieceFile }, async (args) => {
          const contents = await this.inline(await Bun.file(args.path).text(), args.path);
          return contents === null ? undefined : { contents, loader: "ts" };
        });
        build.onLoad({ filter: SignalDescriptors.#wholeFile }, async (args) => {
          const pieces = this.#takenFromPieces(args.path);
          const contents = pieces && (await this.withoutPieces(await Bun.file(args.path).text(), args.path, pieces));
          return contents ? { contents, loader: "ts" } : undefined;
        });
      },
    };
  }

  async inline(source: string, absPath: string): Promise<string | null> {
    const macroImport = SignalDescriptors.#macroImport;
    const calls = [...source.matchAll(SignalDescriptors.#macroCall)];
    const [call] = calls;
    const name = call?.[1];
    if (!SignalDescriptors.#pieceFile.test(absPath) || !call || !name || calls.length !== 1) return null;
    if (source.split(macroImport).length !== 2) return null;
    const descriptors = (await this.#descriptorsOf(path.resolve(path.dirname(absPath), "../sig.ts")))?.literals;
    const literal = descriptors && Object.hasOwn(descriptors, name) ? descriptors[name] : undefined;
    if (literal === undefined) return null;
    const end = call.index + call[0].length;
    return `${source.slice(0, call.index)}${literal}${source.slice(end)}`.replace(macroImport, "");
  }

  //* A scope's `lib/useClient.ts` with the descriptors of these pieces left out and the pieces imported in their place.
  //* Null where a name cannot be accounted for, so the file keeps its macro and every descriptor.
  async withoutPieces(source: string, absPath: string, pieces: readonly string[]): Promise<string | null> {
    const [macroImport, macroCall] = [SignalDescriptors.#wholeImport, SignalDescriptors.#wholeCall];
    if (source.split(macroImport).length !== 2 || source.split(macroCall).length !== 2) return null;
    const signals = await this.#descriptorsOf(path.resolve(path.dirname(absPath), "sig.ts"));
    if (!signals) return null;
    const { names, literals } = signals;
    if (!names.length || names.some((name) => !Object.hasOwn(literals, name))) return null;
    //? The first name stands for what the scope takes from its base, and a signal of the base may itself be named `base`.
    const [, ...own] = names;
    const fromBase = JSON.parse(literals.base ?? "{}") as Record<string, unknown>;
    const taken = new Set<string>();
    for (const piece of pieces) {
      const calls = [...(await Bun.file(piece).text()).matchAll(SignalDescriptors.#macroCall)];
      const name = calls[0]?.[1];
      if (!name || calls.length !== 1) return null;
      if (name === "base") for (const held of Object.keys(fromBase)) taken.add(held);
      else taken.add(name);
    }
    const kept = [...new Set(own)].filter((name) => !taken.has(name));
    if (kept.includes("base") && !Object.hasOwn(fromBase, "base")) return null;
    const literalOf = (name: string) =>
      name === "base" ? JSON.stringify({ base: fromBase.base }) : (literals[name] ?? "{}");
    const literal = `{${kept
      .map((name) => literalOf(name).slice(1, -1))
      .filter(Boolean)
      .join(",")}}`;
    const loaded = pieces.map((_, index) => `__akanPiece${index}`);
    const imports = [
      'import { loadedAfter as __akanPiecesFirst } from "akanjs/base";',
      ...pieces.map((piece, index) => `import { loaded as ${loaded[index]} } from ${JSON.stringify(piece)};`),
      `__akanPiecesFirst(${loaded.join(", ")});`,
    ];
    return `${imports.join("\n")}\n${source.replace(macroImport, "").replace(macroCall, () => literal)}`;
  }

  #descriptorsOf(sigFile: string): Promise<ScopeSignals | null> {
    const known = this.#reads.get(sigFile);
    if (known) return known;
    const batch = [...new Set([sigFile, ...this.#sigFiles])].filter((file) => !this.#reads.has(file));
    const read = this.#read(batch);
    for (const file of batch)
      this.#reads.set(
        file,
        read.then((byFile) => byFile.get(file) ?? null),
      );
    return this.#reads.get(sigFile) ?? Promise.resolve(null);
  }

  //? `--no-env-file`: the build's `NODE_ENV` define would make Bun load `.env.production` files the build never loaded.
  async #read(sigFiles: string[]): Promise<Map<string, ScopeSignals>> {
    const read = new Map<string, ScopeSignals>();
    const failures = new Map<string, string>();
    const child = Bun.spawn([process.execPath, "--no-env-file", "--eval", SignalDescriptors.#readScript(sigFiles)], {
      cwd: this.#workspaceRoot,
      env: { ...process.env, ...this.#env },
      stdout: "ignore",
      stderr: "ignore",
      serialization: "json",
      ipc: (message: ScopeRead) => {
        if (message.read) read.set(message.file, { names: message.names ?? [], literals: message.read });
        else failures.set(message.file, message.failure ?? "");
      },
    });
    let timedOut = false;
    const kill = () => child.kill("SIGKILL");
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, this.#timeoutMs);
    process.on("exit", kill);
    const code = await child.exited.finally(() => {
      clearTimeout(timer);
      process.off("exit", kill);
    });
    for (const [file, failure] of failures)
      this.#onUnread(`the signals of ${this.#scopeOf(file)} could not be read (${failure})`);
    const unsent = sigFiles.filter((file) => !read.has(file) && !failures.has(file));
    if (unsent.length > 0) {
      const why = timedOut
        ? `they did not load within ${this.#timeoutMs / 1000}s, so the process reading them was stopped`
        : `its process exited with code ${code}`;
      this.#onUnread(
        `the signals of ${unsent.map((file) => this.#scopeOf(file)).join(", ")} could not be read (${why})`,
      );
    }
    return read;
  }

  #scopeOf(sigFile: string) {
    return path.relative(this.#workspaceRoot, path.dirname(path.dirname(sigFile)));
  }
}
