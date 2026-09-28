import { mkdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import type { BaseBuildArtifact } from "akanjs/server";
import { type PageEntry, resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";
import { CsrEntryFiles } from "./csrEntryFiles";
import { PagesBundleBuilder } from "./pagesBundleBuilder";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";

export interface BuildCsrArtifactResult {
  outputDir: string;
}

type CssAsset = NonNullable<BaseBuildArtifact["cssAssets"]>[string];

export class CsrArtifactBuilder {
  #app: App;
  #command: "build" | "start";
  #lang: string;

  constructor(app: App, command: "build" | "start" = "start", lang = "en") {
    this.#app = app;
    this.#command = command;
    this.#lang = lang;
  }

  async build(): Promise<BuildCsrArtifactResult | null> {
    const pageKeys = await this.#app.getPageKeys();
    if (pageKeys.length === 0) {
      this.#app.log(`[cli] no route files under ${this.#app.cwdPath}/page — skipping CSR build`);
      return null;
    }

    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    const akanConfig = await this.#app.getConfig();
    const cssAssets = await this.#loadCssAssets();
    const basePaths = [...akanConfig.basePaths];
    const htmlBasePaths = basePaths.length > 0 ? basePaths : [""];
    await rm(this.#outputDir, { recursive: true, force: true });
    await mkdir(this.#generatedDir, { recursive: true });
    const generatedFiles = Object.fromEntries(
      (
        await Promise.all(
          htmlBasePaths.map(async (basePath) => [
            this.#createHtmlFile(basePath),
            await this.#createEntryFile(
              basePath,
              CsrArtifactBuilder.pageEntriesForBasePath(pageEntries, basePath, basePaths),
            ),
          ]),
        )
      ).flat(),
    );

    const result = await Bun.build({
      target: "browser",
      entrypoints: htmlBasePaths.map((basePath) => this.#generatedPath(CsrArtifactBuilder.htmlFilename(basePath))),
      files: generatedFiles,
      root: this.#generatedDir,
      outdir: this.#outputDir,
      splitting: false,
      minify: true,
      env: "AKAN_PUBLIC_*",
      define: bundleDefine(this.#app, this.#command, "csr"),
      optimizeImports: akanConfig.optimizeImports,
      // A raw `.css` in the route graph is Tailwind source; the base artifact's compiled sheet is the only stylesheet.
      plugins: [PagesBundleBuilder.createCssStubPlugin()],
    });

    if (!result.success) {
      const logs = result.logs.map((log) => log.message).join("\n");
      throw new Error(`[csr-build] failed${logs ? `\n${logs}` : ""}`);
    }

    await this.#inlineCsrArtifacts(cssAssets);
    this.#app.verbose(`[csr-build] output -> ${this.#outputDir}`);
    return { outputDir: this.#outputDir };
  }

  /** The routes one basePath's HTML boots: its own plus every route outside any basePath, matching `bootCsr`. */
  static pageEntriesForBasePath(pageEntries: PageEntry[], basePath: string, basePaths: string[]): PageEntry[] {
    return CsrEntryFiles.pageEntriesForBasePath(pageEntries, basePath, basePaths);
  }

  static htmlFilename(basePath: string): string {
    return `${basePath || "index"}.html`;
  }

  static entryFilename(basePath: string): string {
    return CsrEntryFiles.entryFilename(basePath);
  }

  static basePathOfHtml(htmlPath: string): string {
    const name = path.basename(htmlPath, ".html");
    return name === "index" ? "" : name;
  }

  get #outputDir(): string {
    return path.join(
      this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath,
      this.#command === "build" ? "csr" : ".akan/artifact/csr",
    );
  }

  get #generatedDir(): string {
    return path.join(this.#app.cwdPath, ".akan/generated/csr");
  }

  get #artifactDir(): string {
    return path.join(this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath, ".akan/artifact");
  }

  #generatedPath(filename: string): string {
    return path.join(this.#generatedDir, filename);
  }

  async #createEntryFile(basePath: string, pageEntries: PageEntry[]): Promise<readonly [string, string]> {
    return [
      this.#generatedPath(CsrArtifactBuilder.entryFilename(basePath)),
      `import { bootCsr } from "akanjs/webkit";
${await PagesEntrySourceGenerator.generateStatic(pageEntries)}
void bootCsr(pages);
`,
    ] as const;
  }

  #createHtmlFile(basePath: string): readonly [string, string] {
    return [
      this.#generatedPath(CsrArtifactBuilder.htmlFilename(basePath)),
      `<!doctype html>
<html lang="${this.#lang}">
  <head>
    <meta charset="utf-8" />
    <title>${this.#app.name}</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${CsrArtifactBuilder.entryFilename(basePath)}"></script>
  </body>
</html>
  `,
    ] as const;
  }

  async #loadCssAssets(): Promise<Record<string, CssAsset>> {
    const artifactFile = Bun.file(path.join(this.#artifactDir, "base-artifact.json"));
    if (!(await artifactFile.exists())) return {};
    const artifact = (await artifactFile.json()) as Partial<Pick<BaseBuildArtifact, "cssAssets">>;
    return artifact.cssAssets ?? {};
  }

  async #inlineCsrArtifacts(cssAssets: Record<string, CssAsset>): Promise<void> {
    const jsFiles = new Set<string>();
    for (const htmlPath of await this.#listOutputFiles((filePath) => filePath.endsWith(".html"))) {
      const htmlFile = Bun.file(htmlPath);
      if (!(await htmlFile.exists())) continue;
      const basePath = CsrArtifactBuilder.basePathOfHtml(htmlPath);
      const cssAsset = cssAssets[basePath];
      if (!cssAsset) {
        this.#app.logger.warn(
          `[csr-build] base-artifact.json has no compiled stylesheet for ${basePath || "root"}; ${path.basename(htmlPath)} ships without CSS`,
        );
      }
      const inlined = await this.#inlineHtmlAssets(await htmlFile.text(), htmlPath, cssAsset);
      for (const filePath of inlined.jsFiles) jsFiles.add(filePath);
      await Bun.write(htmlPath, inlined.html);
    }
    for (const filePath of jsFiles) await unlink(filePath).catch(() => undefined);
    const remainingAssets = await this.#listOutputFiles(
      (filePath) => filePath.endsWith(".js") || filePath.endsWith(".css"),
    );
    if (remainingAssets.length > 0) {
      throw new Error(`[csr-build] expected single-file HTML, but CSR assets remain:\n${remainingAssets.join("\n")}`);
    }
  }

  async #inlineHtmlAssets(
    html: string,
    htmlPath: string,
    cssAsset?: CssAsset,
  ): Promise<{ html: string; jsFiles: string[] }> {
    let next = html;
    if (cssAsset) {
      const css = await Bun.file(path.join(this.#artifactDir, cssAsset.cssRelPath)).text();
      next = CsrArtifactBuilder.injectBeforeHeadEnd(next, CsrArtifactBuilder.createInlineStyle(css));
    }
    const jsFiles: string[] = [];
    next = await CsrArtifactBuilder.replaceModuleScriptSrc(next, async (src) => {
      const jsPath = CsrArtifactBuilder.resolveHtmlAssetPath(htmlPath, src);
      jsFiles.push(jsPath);
      return await Bun.file(jsPath).text();
    });
    return { html: next, jsFiles };
  }

  async #listOutputFiles(predicate: (filePath: string) => boolean): Promise<string[]> {
    const glob = new Bun.Glob("**/*");
    const files: string[] = [];
    for await (const filePath of glob.scan({ cwd: this.#outputDir, absolute: true })) {
      if (predicate(filePath)) files.push(filePath);
    }
    return files.sort();
  }

  // Bun hoists the module script into <head> and a React bundle contains "</head>" as text, so positions come from a
  // copy with script/style/comment bodies blanked. Never prepends: that would reverse the caller's cascade order.
  static injectBeforeHeadEnd(html: string, snippet: string): string {
    const scannable = CsrArtifactBuilder.blankEmbeddedContent(html);
    const headEnd = scannable.search(/<\/head\s*>/i);
    if (headEnd !== -1) return `${html.slice(0, headEnd)}${snippet}\n${html.slice(headEnd)}`;
    const bodyStart = scannable.search(/<body(?:\s|>)/i);
    if (bodyStart !== -1) return `${html.slice(0, bodyStart)}${snippet}\n${html.slice(bodyStart)}`;
    return `${html}\n${snippet}`;
  }

  static blankEmbeddedContent(html: string): string {
    return html.replace(
      /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi,
      (match) => " ".repeat(match.length),
    );
  }

  static createInlineStyle(css: string): string {
    return `<style data-akan-css="active">\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
  }

  static async replaceModuleScriptSrc(
    html: string,
    loadScript: (src: string) => Promise<string> | string,
  ): Promise<string> {
    const scriptRe = /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>\s*<\/script>/gi;
    let result = "";
    let lastIndex = 0;
    let matched = false;
    for (const match of html.matchAll(scriptRe)) {
      const full = match[0];
      const src = match[1];
      if (match.index === undefined || !src) continue;
      matched = true;
      result += html.slice(lastIndex, match.index);
      result += `<script type="module">\n${CsrArtifactBuilder.escapeInlineScript(await loadScript(src))}\n</script>`;
      lastIndex = match.index + full.length;
    }
    if (!matched) return html;
    return result + html.slice(lastIndex);
  }

  static escapeInlineScript(source: string): string {
    return source.replace(/<\/script/gi, "<\\/script");
  }

  static resolveHtmlAssetPath(htmlPath: string, src: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) {
      throw new Error(`[csr-build] cannot inline external script: ${src}`);
    }
    const normalized = src.startsWith("/") ? src.slice(1) : src;
    return path.resolve(path.dirname(htmlPath), normalized);
  }
}
