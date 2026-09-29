import path from "node:path";
import {
  type AkanBinConfig,
  type AkanBinPathSource,
  type AkanBinSource,
  type AkanBinUrlSource,
  type BinPlatform,
  binPlatforms,
} from "./types";

//* Checked when the config loads, and a `path` source is made absolute against the folder that declares it: a lib's
//* relative path has to find its file from every app that carries it.
export class AkanBin {
  static readonly archive = /\.(zip|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2|tar)$/i;
  static readonly fileName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

  static parse(declared: unknown, owner: string, baseDir: string): AkanBinConfig {
    if (declared === undefined) return {};
    if (!declared || typeof declared !== "object" || Array.isArray(declared))
      throw new Error(`${owner}: bin maps each executable's name to its platforms`);
    return Object.fromEntries(
      Object.entries(declared).map(([name, platforms]) => [name, AkanBin.#platforms(name, platforms, owner, baseDir)]),
    );
  }

  static isArchive(source: AkanBinSource): boolean {
    return AkanBin.archive.test("url" in source ? new URL(source.url).pathname : source.path);
  }

  static #platforms(name: string, platforms: unknown, owner: string, baseDir: string) {
    if (!AkanBin.fileName.test(name)) throw new Error(`${owner}: bin.${name} is not a file name`);
    if (!platforms || typeof platforms !== "object" || Array.isArray(platforms))
      throw new Error(`${owner}: bin.${name} maps platforms (${binPlatforms.join(", ")}) to where the file comes from`);
    const resolved: { [platform in BinPlatform]?: AkanBinSource } = {};
    for (const [platform, source] of Object.entries(platforms)) {
      if (!(binPlatforms as readonly string[]).includes(platform))
        throw new Error(`${owner}: bin.${name}.${platform} is not one of ${binPlatforms.join(", ")}`);
      resolved[platform as BinPlatform] = AkanBin.#source(`${owner}: bin.${name}.${platform}`, source, baseDir);
    }
    return resolved;
  }

  static #source(at: string, source: unknown, baseDir: string): AkanBinSource {
    if (!source || typeof source !== "object" || Array.isArray(source))
      throw new Error(`${at} must be { url, sha256 } or { path }`);
    const { url, sha256, path: localPath, file, ...rest } = source as Record<string, unknown>;
    const extra = Object.keys(rest);
    if (extra.length) throw new Error(`${at}: unknown key ${extra.join(", ")}`);
    if ((url === undefined) === (localPath === undefined))
      throw new Error(`${at} takes either url and sha256, or path`);
    const resolved =
      url !== undefined ? AkanBin.#urlSource(at, url, sha256) : AkanBin.#pathSource(at, localPath, sha256, baseDir);
    const archive = AkanBin.isArchive(resolved);
    if (file === undefined) {
      if (archive) throw new Error(`${at} names an archive: file picks the executable inside it`);
      return resolved;
    }
    if (!archive) throw new Error(`${at}: file picks the executable out of an archive, and this source is none`);
    const parts = typeof file === "string" ? file.split(/[\\/]/).filter((part) => part && part !== ".") : [];
    if (!parts.length || path.isAbsolute(file as string) || parts.includes(".."))
      throw new Error(`${at}: file must be a path inside the archive (got ${JSON.stringify(file)})`);
    return { ...resolved, file: parts.join("/") };
  }

  static #urlSource(at: string, url: unknown, sha256: unknown): AkanBinUrlSource {
    if (typeof url !== "string" || !URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol))
      throw new Error(`${at}: url must be an http(s) address`);
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256))
      throw new Error(`${at}: sha256 must be the downloaded file's 64-digit hex digest`);
    return { url, sha256: sha256.toLowerCase() };
  }

  static #pathSource(at: string, localPath: unknown, sha256: unknown, baseDir: string): AkanBinPathSource {
    if (typeof localPath !== "string" || !localPath) throw new Error(`${at}: path must name a file`);
    if (sha256 !== undefined) throw new Error(`${at}: sha256 checks a download, and a path source downloads nothing`);
    return { path: path.resolve(baseDir, localPath) };
  }
}
