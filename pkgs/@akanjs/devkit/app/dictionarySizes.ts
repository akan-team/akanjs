import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { BaseBuildArtifact } from "akanjs/server";
import { FontPruner } from "../frontendBuild/fontPruner";

export interface DictionarySize {
  lang: string;
  pageBrotliBytes: number;
  apiBrotliBytes?: number;
}

export class DictionarySizes {
  static of(artifactDir: string): DictionarySize[] {
    const artifactPath = path.join(artifactDir, "base-artifact.json");
    if (!fs.existsSync(artifactPath)) return [];
    const { dictAssets = {} } = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Pick<
      BaseBuildArtifact,
      "dictAssets"
    >;
    const brotliOf = (relPath: string) => DictionarySizes.#brotliBytesOf(path.join(artifactDir, relPath));
    return Object.entries(dictAssets).map(([lang, asset]) => {
      const api = asset.parts?.api;
      return {
        lang,
        pageBrotliBytes: brotliOf(asset.relPath),
        ...(api ? { apiBrotliBytes: brotliOf(api.relPath) } : {}),
      };
    });
  }

  static format({ lang, pageBrotliBytes, apiBrotliBytes }: DictionarySize): string {
    const { formatBytes } = FontPruner;
    const api = apiBrotliBytes === undefined ? "" : `, API descriptions ${formatBytes(apiBrotliBytes)} where shown`;
    return `Dictionary ${lang}: ${formatBytes(pageBrotliBytes)} brotli on every page${api}`;
  }

  //? The `.br` sidecar is what a browser gets; a build that stops before the compress phase has none.
  static #brotliBytesOf(file: string): number {
    const sidecar = `${file}.br`;
    if (fs.existsSync(sidecar)) return fs.statSync(sidecar).size;
    const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY };
    return zlib.brotliCompressSync(fs.readFileSync(file), { params }).byteLength;
  }
}
