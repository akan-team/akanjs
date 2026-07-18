import { mkdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import type { BaseBuildArtifact } from "akanjs/server";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";

export interface BuildCsrArtifactResult {
  outputDir: string;
}

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
    const artifact = await this.#loadCsrArtifact();
    const csrBasePaths = [...akanConfig.basePaths];
    const htmlEntries = csrBasePaths.length > 0 ? csrBasePaths : ["index"];
    await rm(this.#outputDir, { recursive: true, force: true });
    await mkdir(path.join(this.#app.cwdPath, ".akan/generated/csr"), { recursive: true });
    const generatedHtmlFiles = Object.fromEntries(htmlEntries.map((basePath) => this.#createHtmlFile(basePath)));

    const result = await Bun.build({
      target: "browser",
      entrypoints: Object.keys(generatedHtmlFiles),
      files: {
        ...generatedHtmlFiles,
        [`${this.#app.cwdPath}/.akan/generated/csr/csr.tsx`]: `
import { bootCsr } from "akanjs/webkit";
${PagesEntrySourceGenerator.generateStatic(pageEntries)}
void bootCsr(pages);
  `,
      },
      root: `${this.#app.cwdPath}/.akan/generated/csr`,
      outdir: this.#outputDir,
      splitting: false,
      minify: true,
      env: "AKAN_PUBLIC_*",
      define: this.#define(),
      optimizeImports: akanConfig.optimizeImports,
    });

    if (!result.success) {
      const logs = result.logs.map((log) => log.message).join("\n");
      throw new Error(`[csr-build] failed${logs ? `\n${logs}` : ""}`);
    }

    await this.#inlineCsrArtifacts(artifact.cssAssets ?? {});
    this.#app.verbose(`[csr-build] output -> ${this.#outputDir}`);
    return { outputDir: this.#outputDir };
  }

  get #outputDir(): string {
    return path.join(
      this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath,
      this.#command === "build" ? "csr" : ".akan/artifact/csr",
    );
  }

  #define(): Record<string, string> {
    const nodeEnv = this.#command === "build" ? "production" : (process.env.NODE_ENV ?? "development");
    return {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
      "process.env.AKAN_PUBLIC_RENDER_ENV": JSON.stringify("csr"),
      ...Object.fromEntries(
        Object.entries(this.#app.getPublicEnv()).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
      ),
    };
  }

  #createHtmlFile(basePath: string): readonly [string, string] {
    const filename = `${basePath}.html`;
    return [
      `${this.#app.cwdPath}/.akan/generated/csr/${filename}`,
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
    <script type="module" src="./csr.tsx"></script>
  </body>
</html>
  `,
    ] as const;
  }

  async #loadCsrArtifact(): Promise<Pick<BaseBuildArtifact, "cssAssets">> {
    const artifactDir = path.join(
      this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath,
      ".akan/artifact",
    );
    const artifactFile = Bun.file(path.join(artifactDir, "base-artifact.json"));
    if (!(await artifactFile.exists())) return { cssAssets: {} };
    const artifact = (await artifactFile.json()) as Pick<BaseBuildArtifact, "cssAssets">;
    return { cssAssets: artifact.cssAssets ?? {} };
  }

  async #inlineCsrArtifacts(cssAssets: Record<string, { cssUrl: string; cssRelPath: string }>): Promise<void> {
    const jsFiles = new Set<string>();
    const cssFiles = new Set<string>();
    for (const htmlPath of await this.#htmlOutputPaths()) {
      const htmlFile = Bun.file(htmlPath);
      if (!(await htmlFile.exists())) continue;
      const basePath = path.basename(htmlPath, ".html") === "index" ? "" : path.basename(htmlPath, ".html");
      const inlined = await this.#inlineHtmlAssets(await htmlFile.text(), htmlPath, cssAssets[basePath]);
      for (const filePath of inlined.jsFiles) jsFiles.add(filePath);
      for (const filePath of inlined.cssFiles) cssFiles.add(filePath);
      await Bun.write(htmlPath, inlined.html);
    }
    for (const filePath of jsFiles) await unlink(filePath).catch(() => undefined);
    for (const filePath of cssFiles) await unlink(filePath).catch(() => undefined);
    const remainingJs = await this.#listOutputFiles((filePath) => filePath.endsWith(".js"));
    const remainingCss = await this.#listOutputFiles((filePath) => filePath.endsWith(".css"));
    const remainingAssets = [...remainingJs, ...remainingCss];
    if (remainingAssets.length > 0) {
      throw new Error(`[csr-build] expected single-file HTML, but CSR assets remain:\n${remainingAssets.join("\n")}`);
    }
  }

  async #inlineHtmlAssets(
    html: string,
    htmlPath: string,
    cssAsset?: { cssUrl: string; cssRelPath: string },
  ): Promise<{ html: string; jsFiles: string[]; cssFiles: string[] }> {
    const jsFiles: string[] = [];
    const cssFiles = CsrArtifactBuilder.collectStylesheetHrefs(html).map((href) =>
      CsrArtifactBuilder.resolveHtmlAssetPath(htmlPath, href),
    );
    let next = CsrArtifactBuilder.stripBundledStylesheetLinks(html);
    next = await CsrArtifactBuilder.replaceModuleScriptSrc(next, async (src) => {
      const jsPath = CsrArtifactBuilder.resolveHtmlAssetPath(htmlPath, src);
      jsFiles.push(jsPath);
      return await Bun.file(jsPath).text();
    });
    const bundledCss = (
      await Promise.all(
        cssFiles.map((cssFile) =>
          Bun.file(cssFile)
            .text()
            .catch(() => ""),
        ),
      )
    )
      .filter(Boolean)
      .join("\n");
    if (bundledCss) {
      const style = CsrArtifactBuilder.createInlineStyle(bundledCss);
      if (!next.includes(style)) next = CsrArtifactBuilder.injectBeforeHeadEnd(next, style);
    }
    if (cssAsset) {
      const cssPath = path.join(
        this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath,
        ".akan/artifact",
        cssAsset.cssRelPath,
      );
      const css = await Bun.file(cssPath).text();
      const style = CsrArtifactBuilder.createInlineStyle(css);
      if (!next.includes(style)) next = CsrArtifactBuilder.injectBeforeHeadEnd(next, style);
    }
    return { html: next, jsFiles, cssFiles };
  }

  async #htmlOutputPaths(): Promise<string[]> {
    return await this.#listOutputFiles((filePath) => filePath.endsWith(".html"));
  }

  async #listOutputFiles(predicate: (filePath: string) => boolean): Promise<string[]> {
    const glob = new Bun.Glob("**/*");
    const files: string[] = [];
    for await (const filePath of glob.scan({ cwd: this.#outputDir, absolute: true })) {
      if (predicate(filePath)) files.push(filePath);
    }
    return files.sort();
  }

  static injectBeforeHeadEnd(html: string, snippet: string): string {
    const matches = [...html.matchAll(/<\/head\s*>/gi)];
    const bodyStart = html.search(/<body(?:\s|>)/i);
    const headEnd = matches
      .filter((match) => match.index !== undefined && (bodyStart === -1 || match.index < bodyStart))
      .at(-1);
    if (!headEnd || headEnd.index === undefined) return `${snippet}\n${html}`;
    return `${html.slice(0, headEnd.index)}${snippet}\n${html.slice(headEnd.index)}`;
  }

  static stripBundledStylesheetLinks(html: string): string {
    return html.replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*>\s*/gi, "");
  }

  static collectStylesheetHrefs(html: string): string[] {
    const linkRe = /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/gi;
    return [...html.matchAll(linkRe)].map((match) => match[1]).filter((href): href is string => !!href);
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
