import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { AkanNativeTarget } from "akanjs";

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

  //* The bundle is inlined into this page and its own code names the global, so only the tag marks an injection;
  //* it goes first in <head>, ahead of every script, because the page reads it as it boots.
  static injectTarget(html: string, target: Pick<AkanNativeTarget, "name" | "basePath" | "indexPath">) {
    if (html.includes(NativeWebDir.#targetTag)) return html;
    const basePath = target.basePath?.replace(/^\/+|\/+$/g, "") ?? "";
    const script = `${NativeWebDir.#targetTag}${JSON.stringify({
      name: target.name,
      basePath,
      indexPath: target.indexPath,
    })};</script>`;
    const head = /<head(?:\s[^>]*)?>/i.exec(html);
    if (!head) return `${script}\n${html}`;
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}\n${script}${html.slice(at)}`;
  }
  static readonly #targetTag = "<script>window.__AKAN_MOBILE_TARGET__=";

  async clear() {
    await rm(this.dir, { recursive: true, force: true });
    await mkdir(this.dir, { recursive: true });
  }

  /** Rebuilds the folder from scratch and answers its files as web paths: relative, `/`-separated and sorted. */
  async assemble(target: AkanNativeTarget, { html, publicDir, fontsDir }: NativeWebDirSources) {
    if (!(await Bun.file(html).exists()))
      throw new Error(`CSR html for native target '${target.name}' not found: ${html}`);
    await this.clear();
    if (publicDir && (await NativeWebDir.#isDir(publicDir))) await cp(publicDir, this.dir, { recursive: true });
    if (fontsDir && (await NativeWebDir.#isDir(fontsDir)))
      await cp(fontsDir, path.join(this.dir, "_akan", "fonts"), { recursive: true });
    if (await NativeWebDir.#isDir(path.join(this.dir, NativeWebDir.reservedEntry)))
      throw new Error(`public/${NativeWebDir.reservedEntry} is reserved for the native runtime.`);
    await Bun.write(path.join(this.dir, "index.html"), NativeWebDir.injectTarget(await Bun.file(html).text(), target));
    const files = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: this.dir, onlyFiles: true, dot: true }));
    //? Bun.Glob answers with the platform's separator, so a Windows scan reads `_akan\fonts\…`.
    return files.map((file) => file.split(path.sep).join("/")).sort();
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
