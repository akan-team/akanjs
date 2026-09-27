import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { AkanMobileTargetConfig } from "akanjs";

export interface NativeWebDirSources {
  /** The target's CSR bundle: one HTML file with its scripts and styles inlined. */
  html: string;
  /** The build's own copy of `public/`, already pruned of fonts nothing reads. */
  publicDir?: string;
  /** Subset fonts, served from `/_akan/fonts` as the page's `<FontFace>` names them. */
  fontsDir?: string;
}

export class NativeWebDir {
  //* The runtime serves its bridge from this prefix and refuses a web root that has one of its own.
  static readonly reservedEntry = "__akan_native";

  constructor(readonly dir: string) {}

  static injectTarget(html: string, target: Pick<AkanMobileTargetConfig, "name" | "basePath" | "indexPath">) {
    if (html.includes("window.__AKAN_MOBILE_TARGET__")) return html;
    const basePath = target.basePath?.replace(/^\/+|\/+$/g, "") ?? "";
    const script = `<script>window.__AKAN_MOBILE_TARGET__=${JSON.stringify({
      name: target.name,
      basePath,
      indexPath: target.indexPath,
    })};</script>`;
    return html.replace(/<\/head\s*>/i, `${script}\n</head>`);
  }

  /** Rebuilds the folder from scratch and answers its files, relative and sorted. */
  async assemble(target: AkanMobileTargetConfig, { html, publicDir, fontsDir }: NativeWebDirSources) {
    if (!(await Bun.file(html).exists()))
      throw new Error(`CSR html for mobile target '${target.name}' not found: ${html}`);
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
    if (publicDir && (await NativeWebDir.#isDir(publicDir))) await cp(publicDir, this.dir, { recursive: true });
    if (fontsDir && (await NativeWebDir.#isDir(fontsDir)))
      await cp(fontsDir, path.join(this.dir, "_akan", "fonts"), { recursive: true });
    if (await NativeWebDir.#isDir(path.join(this.dir, NativeWebDir.reservedEntry)))
      throw new Error(`public/${NativeWebDir.reservedEntry} is reserved for the native runtime.`);
    await Bun.write(path.join(this.dir, "index.html"), NativeWebDir.injectTarget(await Bun.file(html).text(), target));
    return (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: this.dir, onlyFiles: true, dot: true }))).sort();
  }

  static async #isDir(dir: string) {
    try {
      return (await stat(dir)).isDirectory();
    } catch {
      // A missing folder is a source the build did not produce, not an error.
      return false;
    }
  }
}
