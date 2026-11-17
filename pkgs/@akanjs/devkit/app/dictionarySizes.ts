import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { BaseBuildArtifact, DictAsset } from "akanjs/server";
import { FontPruner } from "../frontendBuild/fontPruner";

export interface DictionaryRouteBytes {
  lightest: number;
  median: number;
  largest: number;
}

export interface DictionarySize {
  lang: string;
  pageBrotliBytes: number;
  apiBrotliBytes?: number;
  //? What a first visit downloads of the dictionary under `clientRuntime: "route"`, over every route.
  routeBrotliBytes?: DictionaryRouteBytes;
}

//? precompressArtifacts writes no `.br` for a smaller file, so it is served, and counted, raw.
const minCompressedBytes = 1024;

export class DictionarySizes {
  static of(artifactDir: string): DictionarySize[] {
    const artifactPath = path.join(artifactDir, "base-artifact.json");
    if (!fs.existsSync(artifactPath)) return [];
    const { dictAssets = {}, dictRoutes } = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Pick<
      BaseBuildArtifact,
      "dictAssets" | "dictRoutes"
    >;
    const brotliOf = (relPath: string) => DictionarySizes.#brotliBytesOf(path.join(artifactDir, relPath));
    const routeIds = dictRoutes ? DictionarySizes.#routeIdsOf(artifactDir, dictRoutes) : [];
    return Object.entries(dictAssets).map(([lang, asset]) => {
      const api = asset.parts?.api;
      const page = brotliOf(asset.relPath);
      const routes =
        dictRoutes && routeIds.length ? DictionarySizes.#routes(asset, page, routeIds, dictRoutes, brotliOf) : null;
      return {
        lang,
        pageBrotliBytes: page,
        ...(api ? { apiBrotliBytes: brotliOf(api.relPath) } : {}),
        ...(routes ? { routeBrotliBytes: routes } : {}),
      };
    });
  }

  static format({ lang, pageBrotliBytes, apiBrotliBytes, routeBrotliBytes }: DictionarySize): string {
    const { formatBytes } = FontPruner;
    const api = apiBrotliBytes === undefined ? "" : `, API descriptions ${formatBytes(apiBrotliBytes)} where shown`;
    if (!routeBrotliBytes) return `Dictionary ${lang}: ${formatBytes(pageBrotliBytes)} brotli on every page${api}`;
    const { lightest, median, largest } = routeBrotliBytes;
    const visit = `${formatBytes(lightest)} / ${formatBytes(median)} / ${formatBytes(largest)}`;
    return `Dictionary ${lang}: first visit ${visit} brotli on the lightest / median / largest route (whole ${formatBytes(pageBrotliBytes)})${api}`;
  }

  //? A route the build could not read loads the whole page file, so it counts at that file's size.
  static #routes(
    asset: DictAsset,
    pageBytes: number,
    routeIds: string[],
    dictRoutes: Record<string, number[]>,
    brotliOf: (relPath: string) => number,
  ): DictionaryRouteBytes | null {
    const files = asset.routeParts?.files;
    if (!files) return null;
    const fileBytes = files.map(({ relPath }) => brotliOf(relPath));
    const sizes = routeIds
      .map((routeId) => {
        const parts = dictRoutes[routeId];
        return parts ? parts.reduce((total, idx) => total + (fileBytes[idx] ?? 0), 0) : pageBytes;
      })
      .sort((a, b) => a - b);
    const at = (idx: number) => sizes[idx] ?? 0;
    return { lightest: at(0), median: at(Math.floor((sizes.length - 1) / 2)), largest: at(sizes.length - 1) };
  }

  static #routeIdsOf(artifactDir: string, dictRoutes: Record<string, number[]>): string[] {
    const seedIndexPath = path.join(artifactDir, "route-seed-index.json");
    if (!fs.existsSync(seedIndexPath)) return Object.keys(dictRoutes);
    const { entries = [] } = JSON.parse(fs.readFileSync(seedIndexPath, "utf8")) as { entries?: { routeId: string }[] };
    return [...new Set(entries.map(({ routeId }) => routeId))];
  }

  //? The `.br` sidecar is what a browser gets; a build that stops before the compress phase has none.
  static #brotliBytesOf(file: string): number {
    const sidecar = `${file}.br`;
    if (fs.existsSync(sidecar)) return fs.statSync(sidecar).size;
    const raw = fs.readFileSync(file);
    if (raw.byteLength < minCompressedBytes) return raw.byteLength;
    const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY };
    return zlib.brotliCompressSync(raw, { params }).byteLength;
  }
}
