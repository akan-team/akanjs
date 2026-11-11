import fs from "node:fs";
import path from "node:path";
import { DEFAULT_AKAN_I18N } from "akanjs/common";
import { type Dictionary, TranslatorState } from "../client/translatorState";
import type { SsrManifest } from "./ssrTypes";
import type { BaseBuildArtifact } from "./types";

export class WebArtifact {
  static normalize(artifact: BaseBuildArtifact, artifactDir: string): BaseBuildArtifact {
    const normalizedArtifactDir = path.resolve(artifactDir);
    const pagesBundlePath = WebArtifact.#resolveArtifactPath(artifact.pagesBundlePath, normalizedArtifactDir);
    return {
      ...artifact,
      cssAssets: artifact.cssAssets ?? {},
      dictAssets: artifact.dictAssets ?? {},
      pagesBundlePath,
      rscRuntimeSsrManifest: artifact.rscRuntimeSsrManifest
        ? WebArtifact.#normalizeSsrManifest(artifact.rscRuntimeSsrManifest, normalizedArtifactDir)
        : undefined,
      i18n: artifact.i18n ?? DEFAULT_AKAN_I18N,
    };
  }

  static async loadCssBytesByUrl(
    artifact: BaseBuildArtifact,
    artifactDir: string,
  ): Promise<Record<string, Uint8Array>> {
    const normalizedArtifactDir = path.resolve(artifactDir);
    return Object.fromEntries(
      await Promise.all(
        Object.values(artifact.cssAssets ?? {}).map(async (asset) => [
          asset.cssUrl,
          await Bun.file(path.join(normalizedArtifactDir, asset.cssRelPath)).bytes(),
        ]),
      ),
    );
  }

  //? Fizz renders client components in this process, and no flight prop carries their dictionary.
  static async seedDictionaries(artifact: BaseBuildArtifact, artifactDir: string): Promise<void> {
    const normalizedArtifactDir = path.resolve(artifactDir);
    await Promise.all(
      Object.values(artifact.dictAssets ?? {}).map(async (asset) => {
        const { lang, default: dictionary } = (await import(path.join(normalizedArtifactDir, asset.relPath))) as {
          lang: string;
          default: Dictionary;
        };
        TranslatorState.replace(lang, dictionary);
      }),
    );
  }

  static #normalizeSsrManifest(ssrManifest: SsrManifest, artifactDir: string): SsrManifest {
    return {
      ...ssrManifest,
      moduleMap: Object.fromEntries(
        Object.entries(ssrManifest.moduleMap).map(([entryUrl, byName]) => [
          entryUrl,
          Object.fromEntries(
            Object.entries(byName).map(([name, entry]) => [
              name,
              {
                ...entry,
                id: WebArtifact.#resolveArtifactPath(entry.id, artifactDir),
                chunks: entry.chunks.map((chunk) => WebArtifact.#resolveArtifactPath(chunk, artifactDir)),
              },
            ]),
          ),
        ]),
      ),
    };
  }

  static #resolveArtifactPath(artifactPath: string, artifactDir: string): string {
    if (!path.isAbsolute(artifactPath)) return path.resolve(artifactDir, artifactPath);
    if (fs.existsSync(artifactPath)) return artifactPath;

    const marker = `${path.sep}.akan${path.sep}artifact${path.sep}`;
    const markerIndex = artifactPath.lastIndexOf(marker);
    if (markerIndex >= 0) {
      const rel = artifactPath.slice(markerIndex + marker.length);
      return path.resolve(artifactDir, rel);
    }

    return path.resolve(artifactDir, "server", path.basename(artifactPath));
  }
}
