import path from "node:path";

// A closure walk, not a grep of the entry: `splitting: true` moves eager deps into chunks the entry imports. Only static
// `from "…"` specifiers are followed, so a dynamic `import("x")` is correctly not counted.
export class EntryModuleGraph {
  /** Measured at 9-76 MB resident each on import. Each is loaded by *some* command or worker. */
  static readonly heavyDependencies = [
    "typescript",
    "ink",
    "ssh2",
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
      // Must match `CliDistBuilder.#bundle` (entrypoints, splitting, externals): a differently built guard guards nothing.
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
