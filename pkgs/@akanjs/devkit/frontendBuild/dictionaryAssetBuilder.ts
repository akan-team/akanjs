import path from "node:path";
import { type AllDictionary, Translator } from "akanjs/client";
import type { AkanI18nConfig } from "akanjs/common";
import type { DictAsset } from "akanjs/server";
import type { App } from "../commandDecorators";

export class DictionaryAssetBuilder {
  static readonly urlPrefix = "/_akan/dict";
  readonly #app: App;
  readonly #absArtifactDir: string;

  constructor(app: App, absArtifactDir: string) {
    this.#app = app;
    this.#absArtifactDir = absArtifactDir;
  }

  async build(i18n: AkanI18nConfig): Promise<Record<string, DictAsset>> {
    const allDictionary = await this.#loadAllDictionary();
    if (!allDictionary) return {};
    const assets = await Promise.all(
      i18n.locales.map((lang) =>
        this.#write(lang, Translator.fillFromDefault(allDictionary, lang, i18n.defaultLocale)),
      ),
    );
    this.#app.verbose(`[base-artifact] dictionaries -> ${assets.map(([, asset]) => asset.relPath).join(", ")}`);
    return Object.fromEntries(assets);
  }

  //? The same module the root layout's macro evaluates in this process, so the asset and the RSC worker's copy agree.
  async #loadAllDictionary(): Promise<AllDictionary | null> {
    const dictPath = path.resolve(this.#app.cwdPath, "lib", "dict.ts");
    if (!(await Bun.file(dictPath).exists())) return null;
    const { getAllDictionary } = (await import(dictPath)) as { getAllDictionary?: () => AllDictionary };
    return getAllDictionary ? getAllDictionary() : null;
  }

  async #write(lang: string, dictionary: object): Promise<readonly [string, DictAsset]> {
    const source = DictionaryAssetBuilder.source(lang, dictionary);
    const name = `${lang}-${Bun.hash(source).toString(36)}.js`;
    const relPath = `dict/${name}`;
    await Bun.write(path.join(this.#absArtifactDir, relPath), source);
    return [lang, { url: `${DictionaryAssetBuilder.urlPrefix}/${name}`, relPath }] as const;
  }

  //? A string for JSON.parse, not an object literal: engines parse the JSON grammar faster than a JS expression.
  static source(lang: string, dictionary: object): string {
    return `export const lang = ${JSON.stringify(lang)};\nexport default JSON.parse(${JSON.stringify(JSON.stringify(dictionary))});\n`;
  }
}
