import { mkdir, readdir, rename, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { parseRouteModuleKey } from "akanjs/common";
import type { BaseBuildArtifact } from "akanjs/server";
import type { PageEntry } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { McpAppPageTrimmer } from "../transforms/mcpAppPageTrimmer";
import { PureLazyMarker } from "../transforms/pureLazyMarker";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";
import { CsrEntryFiles } from "./csrEntryFiles";

type CssAsset = NonNullable<BaseBuildArtifact["cssAssets"]>[string];

interface McpAppViewBuildOption {
  basePaths: string[];
  cssAssets: Record<string, CssAsset>;
  /** The CSR shell's own bundle options, so a view inlines the same env and stubs the same stylesheets. */
  options: ReturnType<typeof CsrArtifactBuilder.bundleOptions>;
}

export interface McpAppView {
  name: string;
  page: PageEntry;
  /** The generated root layout that renders `System.Provider` for the page, whose `McpAppRoot` the view uses. */
  root: PageEntry | null;
  /** The generated wrappers of the `_overrides.tsx` the web draws outside the root layout, outermost first: they also
   * reach what it draws beside the page, its toasts and approvals. */
  rootOverrides: PageEntry[];
  /** The generated wrappers of the rest of the `_overrides.tsx` over the page, outermost first, around it alone. */
  overrides: PageEntry[];
  basePath: string;
}

//* One single-file HTML per `.app()`, which an MCP host renders as that app's view: its entry imports the app's page,
//* trimmed to its loads, and the page's root layout for its providers. Built beside `csr/`, never inside it: a native
//* app packs `csr/`, which needs none of them.
export class McpAppViewBuilder {
  /** The folder the server reads views from: `WebRouter.mcpAppViewDir`. */
  static readonly dirName = "mcp-apps";
  /** `PageDefinition.promptName`, which also keeps a view's file name inside its folder. */
  static readonly #appName = /^[A-Za-z0-9_-]{1,64}$/;

  readonly #app: App;
  readonly #command: "build" | "start";

  constructor(app: App, command: "build" | "start") {
    this.#app = app;
    this.#command = command;
  }

  get outputDir(): string {
    return this.#command === "build"
      ? path.join(this.#app.dist.cwdPath, McpAppViewBuilder.dirName)
      : path.join(this.#app.cwdPath, ".akan", "artifact", McpAppViewBuilder.dirName);
  }

  async build(
    pageEntries: PageEntry[],
    { basePaths, cssAssets, options }: McpAppViewBuildOption,
  ): Promise<McpAppView[]> {
    const views = await McpAppViewBuilder.discover(pageEntries, basePaths);
    if (!views.length) {
      await rm(this.outputDir, { recursive: true, force: true });
      return views;
    }
    //? Built aside, then moved in a file at a time: a host may read a view while `akan start` rebuilds them.
    const stagingDir = `${this.outputDir}.next`;
    await rm(stagingDir, { recursive: true, force: true });
    const generatedDir = path.join(this.#app.cwdPath, ".akan", "generated", McpAppViewBuilder.dirName);
    await rm(generatedDir, { recursive: true, force: true });
    await mkdir(generatedDir, { recursive: true });
    const files = Object.fromEntries(
      views.flatMap((view) => [
        [path.join(generatedDir, `${view.name}.html`), McpAppViewBuilder.htmlOf(view)],
        [path.join(generatedDir, `${view.name}.view.tsx`), McpAppViewBuilder.entryOf(view, generatedDir)],
      ]),
    );
    const pagePaths = [...new Set(views.map((view) => view.page.moduleAbsPath))];
    const result = await Bun.build({
      ...options,
      plugins: [...options.plugins, McpAppPageTrimmer.plugin(pagePaths), PureLazyMarker.plugin()],
      entrypoints: views.map((view) => path.join(generatedDir, `${view.name}.html`)),
      files,
      root: generatedDir,
      outdir: stagingDir,
    });
    if (!result.success) {
      const logs = result.logs.map((log) => log.message).join("\n");
      throw new Error(`[mcp-app-build] failed${logs ? `\n${logs}` : ""}`);
    }
    for (const view of views) await this.#inline(view, stagingDir, cssAssets[view.basePath]);
    await this.#publish(views, stagingDir);
    return views;
  }

  async #publish(views: McpAppView[], stagingDir: string) {
    const names = new Set(views.map((view) => `${view.name}.html`));
    await mkdir(this.outputDir, { recursive: true });
    for (const name of names) await rename(path.join(stagingDir, name), path.join(this.outputDir, name));
    for (const name of await readdir(this.outputDir))
      if (!names.has(name)) await rm(path.join(this.outputDir, name), { recursive: true, force: true });
    const strays = await readdir(stagingDir);
    if (strays.length)
      this.#app.logger.warn(
        `[mcp-app-build] ${strays.join(", ")} reached no view; a view loads nothing beside its own file`,
      );
    await rm(stagingDir, { recursive: true, force: true });
  }

  /** Every `.app()` the pages declare, read off their sources without evaluating them. */
  static async discover(pageEntries: PageEntry[], basePaths: string[]): Promise<McpAppView[]> {
    const { RouteSourceValidator } = await import("../routeSourceValidator");
    const roots = pageEntries.filter((entry) => parseRouteModuleKey(entry.key).isInternalRootLayout);
    const overrides = pageEntries.filter((entry) => parseRouteModuleKey(entry.key).kind === "overrides");
    const layoutNodes = new Set(
      pageEntries.flatMap((entry) => {
        const parsed = parseRouteModuleKey(entry.key);
        return parsed.kind === "layout" && !parsed.isInternalRootLayout ? [parsed.routeSegments.join("/")] : [];
      }),
    );
    const owners = new Map<string, { name: string; key: string }>();
    const views: McpAppView[] = [];
    for (const page of pageEntries) {
      if (parseRouteModuleKey(page.key).kind !== "page") continue;
      const source = await Bun.file(page.moduleAbsPath).text();
      const apps =
        RouteSourceValidator.validateRouteSourceExports(source, page.moduleAbsPath, "page").chain?.apps ?? [];
      for (const name of apps) {
        if (!McpAppViewBuilder.#appName.test(name))
          throw new Error(
            `[route-convention] app name "${name}" in ${page.key} must match ${McpAppViewBuilder.#appName}`,
          );
        //? Keyed in lower case: a case-insensitive disk would write two such views to one file.
        const owner = owners.get(name.toLowerCase());
        if (owner?.name === name)
          throw new Error(`[route-convention] app "${name}" is declared by both ${owner.key} and ${page.key}`);
        if (owner)
          throw new Error(
            `[route-convention] apps "${owner.name}" (${owner.key}) and "${name}" (${page.key}) differ only in case; their views would share one file`,
          );
        owners.set(name.toLowerCase(), { name, key: page.key });
        const root = await McpAppViewBuilder.#rootOf(page.key, roots);
        views.push({
          name,
          page,
          root,
          ...McpAppViewBuilder.#overridesOf(page.key, root, overrides, layoutNodes),
          basePath: CsrEntryFiles.basePathOfPageKey(page.key, basePaths) ?? "",
        });
      }
    }
    return views;
  }

  static htmlOf(view: McpAppView): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${view.name}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${view.name}.view.tsx"></script>
  </body>
</html>
`;
  }

  static entryOf(view: McpAppView, fromDir: string): string {
    const specifier = (absPath: string) => {
      const relative = path.relative(fromDir, absPath).split(path.sep).join("/");
      return JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`);
    };
    const importsOf = (entries: PageEntry[], name: string) =>
      entries.map((entry, idx) => `import ${name}${idx} from ${specifier(entry.moduleAbsPath)};\n`).join("");
    const namesOf = (entries: PageEntry[], name: string) => entries.map((_, idx) => `${name}${idx}`).join(", ");
    return `import { McpAppBoot } from "akanjs/webkit";
import * as page from ${specifier(view.page.moduleAbsPath)};
${view.root ? `import * as root from ${specifier(view.root.moduleAbsPath)};` : "const root = {};"}
${importsOf(view.rootOverrides, "rootOverride")}${importsOf(view.overrides, "override")}void McpAppBoot.run({
  app: ${JSON.stringify(view.name)},
  page,
  root,
  rootOverrides: [${namesOf(view.rootOverrides, "rootOverride")}],
  overrides: [${namesOf(view.overrides, "override")}],
  basePath: ${JSON.stringify(view.basePath)},
});
`;
  }

  //? By route segments, as the route tree nests them (`RouteLayering`): a folder's `_overrides.tsx` also covers the
  //? page file named like the folder (`memo/_overrides.tsx` over `memo.tsx`), and one on a root node sits outside the
  //? root layout — the root layout's own node, or one above it that holds no layout of its own.
  static #overridesOf(pageKey: string, root: PageEntry | null, overrides: PageEntry[], layoutNodes: Set<string>) {
    const pageSegments = parseRouteModuleKey(pageKey).routeSegments;
    const rootDepth = root ? parseRouteModuleKey(root.key).routeSegments.length : 0;
    const over = overrides
      .map((entry) => ({ entry, segments: parseRouteModuleKey(entry.key).routeSegments }))
      .filter(({ segments }) => segments.every((segment, idx) => pageSegments[idx] === segment))
      .sort((a, b) => a.segments.length - b.segments.length);
    const onRootNode = (segments: string[]) =>
      segments.length === rootDepth || (segments.length < rootDepth && !layoutNodes.has(segments.join("/")));
    return {
      rootOverrides: over.filter(({ segments }) => onRootNode(segments)).map(({ entry }) => entry),
      overrides: over.filter(({ segments }) => !onRootNode(segments)).map(({ entry }) => entry),
    };
  }

  //? The outermost root boundary over the page: the one a page is drawn under without an ancestor root, which alone
  //? renders `System.Provider` and so exports `McpAppRoot`.
  static async #rootOf(pageKey: string, roots: PageEntry[]): Promise<PageEntry | null> {
    const dirOf = (key: string) => key.slice(0, key.lastIndexOf("/") + 1);
    const pageDir = dirOf(pageKey);
    const over = roots
      .filter((root) => pageDir.startsWith(dirOf(root.key)))
      .sort((a, b) => dirOf(a.key).length - dirOf(b.key).length);
    for (const root of over)
      if ((await Bun.file(root.moduleAbsPath).text()).includes("export function McpAppRoot")) return root;
    return null;
  }

  async #inline(view: McpAppView, dir: string, cssAsset: CssAsset | undefined) {
    const htmlPath = path.join(dir, `${view.name}.html`);
    let html = await Bun.file(htmlPath).text();
    if (cssAsset) {
      const artifactDir = path.join(
        this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath,
        ".akan",
        "artifact",
      );
      const css = await Bun.file(path.join(artifactDir, cssAsset.cssRelPath)).text();
      html = CsrArtifactBuilder.injectBeforeHeadEnd(html, CsrArtifactBuilder.createInlineStyle(css));
    } else this.#app.logger.warn(`[mcp-app-build] no compiled stylesheet for ${view.name}; its view ships without CSS`);
    const scripts: string[] = [];
    html = await CsrArtifactBuilder.replaceModuleScriptSrc(html, async (src) => {
      const jsPath = CsrArtifactBuilder.resolveHtmlAssetPath(htmlPath, src);
      scripts.push(jsPath);
      return await Bun.file(jsPath).text();
    });
    await Bun.write(htmlPath, html);
    for (const script of scripts) await unlink(script).catch(() => undefined);
  }
}
