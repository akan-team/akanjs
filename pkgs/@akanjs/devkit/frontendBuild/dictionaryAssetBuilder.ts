import path from "node:path";
import { type AllDictionary, type Dictionary, Translator } from "akanjs/client";
import type { AkanI18nConfig } from "akanjs/common";
import type { DictAsset } from "akanjs/server";
import type { App } from "../commandDecorators";

export interface DictionaryAssetBuildOptions {
  /** Under `clientRuntime: "route"`: each locale's API descriptions go to a file of their own, loaded where shown. */
  splitApi?: boolean;
}

export class DictionaryAssetBuilder {
  static readonly urlPrefix = "/_akan/dict";
  static readonly apiPart = "api";
  readonly #app: App;
  readonly #absArtifactDir: string;

  constructor(app: App, absArtifactDir: string) {
    this.#app = app;
    this.#absArtifactDir = absArtifactDir;
  }

  async build(
    i18n: AkanI18nConfig,
    { splitApi = false }: DictionaryAssetBuildOptions = {},
  ): Promise<Record<string, DictAsset>> {
    const allDictionary = await this.#loadAllDictionary();
    if (!allDictionary) return {};
    const assets = await Promise.all(
      i18n.locales.map((lang) =>
        this.#writeLocale(lang, Translator.fillFromDefault(allDictionary, lang, i18n.defaultLocale), splitApi),
      ),
    );
    const files = assets.flatMap(([, asset]) => [asset, ...Object.values(asset.parts ?? {})]);
    this.#app.verbose(`[base-artifact] dictionaries -> ${files.map((asset) => asset.relPath).join(", ")}`);
    return Object.fromEntries(assets);
  }

  //? The same module the root layout's macro evaluates in this process, so the asset and the RSC worker's copy agree.
  async #loadAllDictionary(): Promise<AllDictionary | null> {
    const dictPath = path.resolve(this.#app.cwdPath, "lib", "dict.ts");
    if (!(await Bun.file(dictPath).exists())) return null;
    const { getAllDictionary } = (await import(dictPath)) as { getAllDictionary?: () => AllDictionary };
    return getAllDictionary ? getAllDictionary() : null;
  }

  async #writeLocale(lang: string, dictionary: Dictionary, splitApi: boolean): Promise<readonly [string, DictAsset]> {
    const { page, api } = splitApi ? DictionaryAssetBuilder.splitApi(dictionary) : { page: dictionary, api: {} };
    if (!Object.keys(api).length) return [lang, await this.#write(lang, DictionaryAssetBuilder.source(lang, page))];
    const apiAsset = await this.#write(`${lang}-api`, DictionaryAssetBuilder.source(lang, api));
    const parts = { [DictionaryAssetBuilder.apiPart]: apiAsset.url };
    const pageAsset = await this.#write(lang, DictionaryAssetBuilder.source(lang, page, parts));
    return [lang, { ...pageAsset, parts: { [DictionaryAssetBuilder.apiPart]: apiAsset } }];
  }

  async #write(stem: string, source: string): Promise<DictAsset> {
    const name = `${stem}-${Bun.hash(source).toString(36)}.js`;
    const relPath = `dict/${name}`;
    await Bun.write(path.join(this.#absArtifactDir, relPath), source);
    return { url: `${DictionaryAssetBuilder.urlPrefix}/${name}`, relPath };
  }

  //? An endpoint's own label stays with the page: apps show `l("<model>.signal.<endpoint>")` as a button's text.
  static splitApi(dictionary: Dictionary): { page: Dictionary; api: Dictionary } {
    const page: Dictionary = {};
    const api: Dictionary = {};
    for (const [refName, node] of Object.entries(dictionary)) {
      const signal = node.signal;
      if (!DictionaryAssetBuilder.#isNode(signal)) {
        page[refName] = node;
        continue;
      }
      const pageSignal: Record<string, unknown> = {};
      const apiSignal: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(signal)) {
        if (!DictionaryAssetBuilder.#isNode(entry)) {
          pageSignal[key] = entry;
          continue;
        }
        const { desc, arg, ...label } = entry;
        pageSignal[key] = label;
        if (desc !== undefined || arg !== undefined)
          apiSignal[key] = { ...(desc === undefined ? {} : { desc }), ...(arg === undefined ? {} : { arg }) };
      }
      page[refName] = { ...node, signal: pageSignal };
      if (Object.keys(apiSignal).length) api[refName] = { signal: apiSignal };
    }
    return { page, api };
  }

  static #isNode(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  //? A string for JSON.parse, not an object literal: engines parse the JSON grammar faster than a JS expression.
  static source(lang: string, dictionary: object, parts?: Record<string, string>): string {
    const partsLine = parts ? `export const parts = ${JSON.stringify(parts)};\n` : "";
    return `export const lang = ${JSON.stringify(lang)};\n${partsLine}export default JSON.parse(${JSON.stringify(JSON.stringify(dictionary))});\n`;
  }
}
