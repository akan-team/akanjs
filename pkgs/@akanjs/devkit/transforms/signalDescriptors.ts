import path from "node:path";
import type { BunPlugin } from "bun";

type ScopeDescriptors = Record<string, string>;

export interface SignalDescriptorsOptions {
  onUnread?: (reason: string) => void;
}

//* Bun runs a macro module again on each bundler thread, so a build of many pieces reads each scope's signal once here.
export class SignalDescriptors {
  static readonly #pieceFile = /[\\/]lib[\\/]__client[\\/][^\\/]+\.fetch\.ts$/;
  static readonly #macroImport = 'import { getSerializedSignalOf } from "../sig" with { type: "macro" };';
  static readonly #macroCall = /\bgetSerializedSignalOf\("([^"\\]+)"\)/g;
  readonly #workspaceRoot: string;
  readonly #sigFiles: string[];
  readonly #onUnread: (reason: string) => void;
  readonly #reads = new Map<string, Promise<ScopeDescriptors | null>>();
  #env: Record<string, string> = {};

  //? In a process of its own: a module imported into this one stays cached after its file changes.
  //? JSON drops undefined, -0, NaN and holes, and a `"__proto__"` key sets a prototype: such a name keeps its macro.
  static #readScript(sigFiles: string[]) {
    return `
const finish = (message, code) => process.send(message, undefined, undefined, () => process.exit(code));
const literalOf = (value) => {
  try {
    const text = JSON.stringify(value);
    return Bun.deepEquals(JSON.parse(text), value, true) && !text.includes('"__proto__":') ? text : undefined;
  } catch {
    return undefined;
  }
};
try {
  const read = {};
  for (const file of ${JSON.stringify(sigFiles)}) {
    const { fetch, getSerializedSignalOf } = await import(file);
    const names = ["base", ...Object.keys(fetch.ownSerializedSignal)];
    const literals = names.map((name) => [name, literalOf(getSerializedSignalOf(name))]);
    read[file] = Object.fromEntries(literals.filter(([, literal]) => literal !== undefined));
  }
  finish({ read }, 0);
} catch (error) {
  finish({ failure: String(error?.message ?? error) }, 1);
}
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
    { onUnread = () => undefined }: SignalDescriptorsOptions = {},
  ) {
    this.#workspaceRoot = workspaceRoot;
    this.#sigFiles = scopes.map((scope) => path.join(workspaceRoot, scope, "lib/sig.ts"));
    this.#onUnread = onUnread;
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
    const literal = (await this.#descriptorsOf(path.resolve(path.dirname(absPath), "../sig.ts")))?.[name];
    if (literal === undefined) return null;
    const end = call.index + call[0].length;
    return `${source.slice(0, call.index)}${literal}${source.slice(end)}`.replace(macroImport, "");
  }

  #descriptorsOf(sigFile: string): Promise<ScopeDescriptors | null> {
    const known = this.#reads.get(sigFile);
    if (known) return known;
    const batch = [...new Set([sigFile, ...this.#sigFiles])].filter((file) => !this.#reads.has(file));
    const read = this.#read(batch);
    for (const file of batch)
      this.#reads.set(
        file,
        read.then((byFile) => byFile?.[file] ?? null),
      );
    return this.#reads.get(sigFile) ?? Promise.resolve(null);
  }

  async #read(sigFiles: string[]): Promise<Record<string, ScopeDescriptors> | null> {
    let sent: { read?: Record<string, ScopeDescriptors>; failure?: string } = {};
    const child = Bun.spawn([process.execPath, "--eval", SignalDescriptors.#readScript(sigFiles)], {
      cwd: this.#workspaceRoot,
      env: { ...process.env, ...this.#env },
      stdout: "ignore",
      stderr: "ignore",
      serialization: "json",
      ipc: (message: typeof sent) => {
        sent = message;
      },
    });
    const code = await child.exited;
    if (code === 0 && sent.read) return sent.read;
    const scopes = sigFiles.map((file) => path.relative(this.#workspaceRoot, path.dirname(path.dirname(file))));
    this.#onUnread(`the signals of ${scopes.join(", ")} could not be read (${sent.failure ?? `exit code ${code}`})`);
    return null;
  }
}
