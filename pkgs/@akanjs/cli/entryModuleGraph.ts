import path from "node:path";

interface SourceGraph {
  chunks: Map<string, string>;
  imports: Map<string, string[]>;
}

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
      metafile: true,
    });
    if (!result.success) throw new AggregateError(result.logs, "entry graph build failed");
    const outputs = new Map<string, string>();
    for (const output of result.outputs) outputs.set(output.path.replace(/^\.\//, ""), await output.text());
    const sources: SourceGraph = { chunks: new Map(), imports: new Map() };
    // Metafile paths are relative to the working directory; a bare `external` path is the package specifier.
    const resolve = (file: string) => path.resolve(process.cwd(), file);
    for (const [output, { entryPoint }] of Object.entries(result.metafile?.outputs ?? {}))
      if (entryPoint) sources.chunks.set(resolve(entryPoint), output.replace(/^\.\//, ""));
    for (const [input, { imports }] of Object.entries(result.metafile?.inputs ?? {}))
      sources.imports.set(
        resolve(input),
        imports
          .filter((edge) => edge.kind === "import-statement")
          .map((edge) => (edge.external ? edge.path : resolve(edge.path))),
      );
    return new EntryModuleGraph(outputs, sources);
  }

  readonly #outputs: Map<string, string>;
  readonly #sources: SourceGraph;

  constructor(outputs: Map<string, string>, sources: SourceGraph = { chunks: new Map(), imports: new Map() }) {
    this.#outputs = outputs;
    this.#sources = sources;
  }

  hasEntry(entry: string): boolean {
    return this.#outputs.has(entry);
  }

  chunkOf(source: string): string {
    const chunk = this.#sources.chunks.get(source);
    if (!chunk) throw new Error(`no output was built from ${source}`);
    return chunk;
  }

  importChain(source: string, dependency: string): string[] {
    const parents = new Map<string, string | null>([[source, null]]);
    const queue = [source];
    for (let current = queue.shift(); current !== undefined; current = queue.shift()) {
      if (current === dependency || current.startsWith(`${dependency}/`)) {
        const chain: string[] = [];
        for (let step: string | null | undefined = current; step; step = parents.get(step)) chain.unshift(step);
        return chain;
      }
      for (const next of this.#sources.imports.get(current) ?? []) {
        if (parents.has(next)) continue;
        parents.set(next, current);
        queue.push(next);
      }
    }
    return [];
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
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}
