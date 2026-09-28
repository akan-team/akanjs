import fs from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";
import type { PageEntry } from "../artifact/implicitRootLayout";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { createBarrelImportsPlugin } from "../transforms/barrelImportsPlugin";
import { createExternalizeFrameworkPlugin } from "../transforms/externalizeFrameworkPlugin";
import { loaderFor } from "../transforms/moduleSyntax";
import { transformUseClient } from "../transforms/rscUseClientTransform";
import { createUseClientBundlePlugin } from "../transforms/useClientBundlePlugin";
import { bundleDefine } from "./bundleDefine";
import { CsrDevPaths } from "./csrDevPaths";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";
import { ServerGraphFile } from "./serverGraphFile";

export interface BuildPagesBundleResult {
  bundlePath: string;
  /** Cache-bust value for `import(bundlePath?v=<buildId>)`. */
  buildId: number;
  splitting: boolean;
  entryBytes: number;
  outputBytes: number;
  outputCount: number;
  chunkCount: number;
}

const VIRTUAL_PAGES_ENTRY = "akan-pages-entry";

export class PagesBundleBuilder {
  #app: App;
  #command: "build" | "start";
  #pageEntries?: PageEntry[];
  #started = Date.now();

  constructor(app: App, command: "build" | "start" = "start", pageEntries?: PageEntry[]) {
    this.#app = app;
    this.#command = command;
    this.#pageEntries = pageEntries;
  }

  async build(): Promise<BuildPagesBundleResult> {
    const akanConfig = await this.#app.getConfig();
    const resolvedEntries =
      this.#pageEntries ?? (await resolveSsrPageEntriesForApp(this.#app, await this.#app.getPageKeys()));
    const entrySource = PagesEntrySourceGenerator.generate(resolvedEntries);
    const workspaceRoot = this.#app.workspace.workspaceRoot;
    const dev = this.#command === "start";
    const clientExports: Record<string, string[]> = {};
    const onClientModule = dev
      ? (file: string, exports: string[]) => {
          clientExports[CsrDevPaths.realpath(file)] = exports;
        }
      : undefined;
    const result = await Bun.build({
      entrypoints: [VIRTUAL_PAGES_ENTRY],
      outdir: `${this.#artifactDir}/server`,
      target: "bun",
      format: "esm",
      splitting: this.#splitting,
      minify: this.#command === "build",
      naming: {
        entry: "pages-[hash].[ext]",
        chunk: "chunks/[name]-[hash].[ext]",
        asset: "assets/[name]-[hash].[ext]",
      },
      define: bundleDefine(this.#app, this.#command, "ssr"),
      metafile: dev,
      plugins: [
        PagesBundleBuilder.createPagesEntryPlugin(entrySource),
        PagesBundleBuilder.createCssStubPlugin(),
        PagesBundleBuilder.createServerUseClientFetchPlugin(),
        await createExternalizeFrameworkPlugin({ app: this.#app, extra: akanConfig.externalLibs }),
        akanConfig.barrelImports.length > 0
          ? await createBarrelImportsPlugin(this.#app, {
              pipeAfter: (source, args) =>
                transformUseClient(source, {
                  path: args.path,
                  workspaceRoot,
                  onClientModule,
                }),
            })
          : createUseClientBundlePlugin({ workspaceRoot, onClientModule }),
      ],
    });

    if (!result.success) throw new AggregateError(result.logs, "[PagesBundleBuilder] Bun.build failed");

    const entryArtifact = result.outputs.find((a) => a.kind === "entry-point");
    if (!entryArtifact) throw new Error("[PagesBundleBuilder] Bun.build emitted no entry-point artifact");

    const bundlePath = path.resolve(entryArtifact.path);
    const buildId = Date.now();
    if (dev && result.metafile)
      await ServerGraphFile.write(this.#artifactDir, this.#serverGraph(result.metafile, clientExports));
    const outputBytes = result.outputs.reduce((sum, output) => sum + output.size, 0);
    const chunkCount = result.outputs.filter((output) => output.kind === "chunk").length;
    this.#app.verbose(
      `[PagesBundleBuilder] ${path.basename(bundlePath)} emitted in ${Date.now() - this.#started}ms splitting=${this.#splitting} entry=${entryArtifact.size} bytes outputs=${result.outputs.length} chunks=${chunkCount} total=${outputBytes} bytes`,
    );
    return {
      bundlePath,
      buildId,
      splitting: this.#splitting,
      entryBytes: entryArtifact.size,
      outputBytes,
      outputCount: result.outputs.length,
      chunkCount,
    };
  }

  #serverGraph(metafile: Bun.BuildMetafile, clientExports: Record<string, string[]>) {
    const inputs = Object.keys(metafile.inputs)
      .filter((input) => !input.includes("node_modules"))
      .map((input) => path.resolve(input))
      .filter((input) => fs.existsSync(input))
      .map((input) => CsrDevPaths.realpath(input));
    return { inputs, clientExports };
  }

  get #artifactDir(): string {
    return `${this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath}/.akan/artifact`;
  }

  get #splitting(): boolean {
    return process.env.AKAN_SERVER_PAGES_SPLITTING === "1";
  }

  static createPagesEntryPlugin(source: string): BunPlugin {
    return {
      name: "akan-pages-entry",
      setup(build) {
        build.onResolve({ filter: /^akan-pages-entry$/ }, () => ({
          path: VIRTUAL_PAGES_ENTRY,
          namespace: "akan-virtual",
        }));
        build.onLoad({ filter: /^akan-pages-entry$/, namespace: "akan-virtual" }, () => ({
          contents: source,
          loader: "tsx",
        }));
      },
    };
  }

  static createCssStubPlugin(): BunPlugin {
    return {
      name: "akan-css-stub",
      setup(build) {
        build.onLoad({ filter: /\.css$/ }, () => ({
          contents: "",
          loader: "js",
        }));
      },
    };
  }

  static createServerUseClientFetchPlugin(): BunPlugin {
    return {
      name: "akan-server-use-client-fetch",
      setup(build) {
        build.onLoad({ filter: /[/\\]lib[/\\]useClient\.(ts|tsx|js|jsx)$/ }, async (args) => {
          const source = await Bun.file(args.path).text();
          const transformed = PagesBundleBuilder.transformServerUseClientFetchSource(source);
          if (transformed === source) return undefined;
          return { contents: transformed, loader: loaderFor(args.path) };
        });
      },
    };
  }

  static transformServerUseClientFetchSource(source: string): string {
    if (!source.includes(`with { type: "macro" }`) || !source.includes("FetchClient.build")) return source;
    return source
      .replace(
        /import\s+\{\s*getSerializedSignal\s*\}\s+from\s+["']\.\/sig["']\s+with\s+\{\s*type\s*:\s*["']macro["']\s*\};/,
        `import { fetch as serverFetch } from "./sig";`,
      )
      .replace(
        /const\s+fetchProto\s*=\s*FetchClient\.build<[^;]+;/,
        "const fetchProto = FetchClient.build<typeof signal>(cnst, serverFetch.serializedSignal, { Err: pageProto.Err, base: serverFetch });",
      );
  }
}
