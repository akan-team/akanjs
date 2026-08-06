import path from "node:path";

/**
 * The static module graph of the four entrypoints `CliDistBuilder` ships, built in the same shape the
 * dist build produces.
 *
 * **Why a closure walk rather than a grep of the entry file.** `splitting: true` moves shared code
 * into chunks, so a dependency the entry loads eagerly usually lands in a chunk the entry statically
 * imports — not in the entry itself. Grepping the entry alone reports a false green: measured,
 * `index.js` reaches `@inquirer/prompts` through exactly one chunk hop, which the original guard
 * could not see.
 *
 * Only static `from "…"` specifiers are followed. A dynamic `import("x")` has no `from` clause, so a
 * lazily-loaded module is correctly not counted — that distinction is the whole point of the guard.
 */
export class EntryModuleGraph {
  /** Measured at 9-76 MB resident each on import. Each is loaded by *some* command or worker. */
  static readonly heavyDependencies = [
    "typescript",
    "ink",
    "ssh2",
    "@trapezedev/project",
    "@langchain/core",
    "@langchain/openai",
    "@tailwindcss/node",
    "tailwindcss",
    "fonteditor-core",
    "subset-font",
    "fontaine",
    "@inquirer/prompts",
    "@kubernetes/client-node",
    "puppeteer",
  ];

  static async create(cliDir: string): Promise<EntryModuleGraph> {
    const devkitDir = path.resolve(cliDir, "../devkit");
    const packageJson = (await Bun.file(`${cliDir}/package.json`).json()) as {
      dependencies?: { [name: string]: string };
      peerDependencies?: { [name: string]: string };
    };
    const result = await Bun.build({
      // Must stay in sync with `CliDistBuilder.#bundle`: same entrypoints, same splitting, same
      // externals. A guard built differently from the artifact guards nothing.
      entrypoints: [
        `${cliDir}/index.ts`,
        `${devkitDir}/incrementalBuilder/incrementalBuilder.proc.ts`,
        `${devkitDir}/incrementalBuilder/buildBatch.proc.ts`,
        `${devkitDir}/typecheck/typecheck.proc.ts`,
      ],
      splitting: true,
      target: "bun",
      naming: { entry: "[name].js", chunk: "[name]-[hash].js" },
      external: Object.keys({ ...packageJson.dependencies, ...packageJson.peerDependencies }).filter(
        (name) => name !== "@akanjs/devkit",
      ),
      plugins: [],
    });
    if (!result.success) throw new AggregateError(result.logs, "entry graph build failed");
    const outputs = new Map<string, string>();
    for (const output of result.outputs) outputs.set(output.path.replace(/^\.\//, ""), await output.text());
    return new EntryModuleGraph(outputs);
  }

  readonly #outputs: Map<string, string>;

  constructor(outputs: Map<string, string>) {
    this.#outputs = outputs;
  }

  hasEntry(entry: string): boolean {
    return this.#outputs.has(entry);
  }

  /** Every bare specifier statically reachable from `entry` through its chunk closure. */
  eagerExternals(entry: string): string[] {
    if (!this.#outputs.has(entry)) throw new Error(`no such entry in the build output: ${entry}`);
    const seen = new Set<string>();
    const queue = [entry];
    const externals = new Set<string>();
    while (queue.length) {
      const current = queue.pop();
      if (!current || seen.has(current)) continue;
      seen.add(current);
      const code = this.#outputs.get(current);
      if (!code) continue;
      for (const [, specifier] of code.matchAll(/from\s*"([^"]+)"/g)) {
        if (!specifier) continue;
        if (specifier.startsWith("./") || specifier.startsWith("../")) {
          const resolved = specifier.replace(/^\.\//, "");
          if (this.#outputs.has(resolved)) queue.push(resolved);
        } else externals.add(specifier);
      }
    }
    return [...externals].sort();
  }

  /** The heavy subset of `eagerExternals`, normalised to the package name. */
  eagerHeavyDependencies(entry: string): string[] {
    const externals = this.eagerExternals(entry);
    return EntryModuleGraph.heavyDependencies
      .filter((dep) => externals.some((name) => name === dep || name.startsWith(`${dep}/`)))
      .sort();
  }
}
