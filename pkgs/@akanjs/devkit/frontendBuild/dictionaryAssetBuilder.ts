import path from "node:path";
import { type AllDictionary, type Dictionary, Translator } from "akanjs/client";
import type { AkanI18nConfig } from "akanjs/common";
import type { DictAsset } from "akanjs/server";
import type { App } from "../commandDecorators";
import { DictionaryPacking } from "./dictionaryPacking";
import { dictionaryBrotliBytesOf } from "./precompressArtifacts";

export interface DictionaryAssetBuildOptions {
  /** Each locale's API descriptions go to a file of their own, loaded where shown. */
  splitApi?: boolean;
  /** The groups each route can show; a route left out loads the whole page file. */
  routes?: ReadonlyMap<string, readonly string[]>;
  /** Development: one file per group, as each route's groups are read when it builds. */
  everyGroupAlone?: boolean;
}

export interface DictionaryAssets {
  assets: Record<string, DictAsset>;
  /** The `routeParts.files` each route loads, by index, the same for every locale. */
  routes?: Record<string, number[]>;
  /** With `everyGroupAlone`: the `routeParts.files` index of each group. */
  groups?: Record<string, number>;
}

interface LocalePages {
  lang: string;
  page: Dictionary;
  api: Dictionary;
}

export class DictionaryAssetBuilder {
  static readonly urlPrefix = "/_akan/dict";
  static readonly apiPart = "api";
  //? How a route's groups name the API description file: no module's group is spelled so.
  static readonly apiGroup = "@api";
  readonly #app: App;
  readonly #absArtifactDir: string;

  constructor(app: App, absArtifactDir: string) {
    this.#app = app;
    this.#absArtifactDir = absArtifactDir;
  }

  async build(i18n: AkanI18nConfig, options: DictionaryAssetBuildOptions = {}): Promise<Record<string, DictAsset>> {
    return (await this.buildAll(i18n, options)).assets;
  }

  async buildAll(
    i18n: AkanI18nConfig,
    { splitApi = false, routes, everyGroupAlone = false }: DictionaryAssetBuildOptions = {},
  ): Promise<DictionaryAssets> {
    const allDictionary = await this.#loadAllDictionary();
    if (!allDictionary) return { assets: {} };
    const locales: LocalePages[] = i18n.locales.map((lang) => {
      const dictionary = Translator.fillFromDefault(allDictionary, lang, i18n.defaultLocale);
      return { lang, ...(splitApi ? DictionaryAssetBuilder.splitApi(dictionary) : { page: dictionary, api: {} }) };
    });
    const groups = [...new Set(locales.flatMap(({ page }) => Object.keys(page)))].sort();
    const packed = routes?.size ? DictionaryAssetBuilder.#pack(routes, locales, i18n.defaultLocale, groups) : null;
    if (packed?.wholeRoutes.length)
      this.#app.verbose(
        `[dictionary] ${packed.wholeRoutes.length} route(s) load the whole page dictionary: their own files would not be smaller. Routes: ${packed.wholeRoutes.join(", ")}`,
      );
    const pack =
      packed && Object.keys(packed.partsByRoute).length
        ? packed
        : everyGroupAlone
          ? { parts: groups.map((group) => [group]), partsByRoute: {} }
          : null;
    const assets = await Promise.all(locales.map((locale) => this.#writeLocale(locale, pack?.parts)));
    const files = assets.flatMap(([, asset]) => [
      asset,
      ...Object.values(asset.parts ?? {}),
      ...(asset.routeParts ? [asset.routeParts.table, ...asset.routeParts.files] : []),
    ]);
    this.#app.verbose(`[base-artifact] dictionaries -> ${files.map((asset) => asset.relPath).join(", ")}`);
    if (!pack?.parts.length) return { assets: Object.fromEntries(assets) };
    const { apiPart, apiGroup } = DictionaryAssetBuilder;
    const apiFile = assets.every(([, asset]) => asset.parts?.[apiPart]) ? pack.parts.length : null;
    if (!everyGroupAlone || routes?.size) {
      const withApi = (routeId: string, files: number[]) =>
        apiFile !== null && routes?.get(routeId)?.includes(apiGroup) ? [...files, apiFile] : files;
      const routed = Object.entries(pack.partsByRoute).map(([routeId, files]) => [routeId, withApi(routeId, files)]);
      return { assets: Object.fromEntries(assets), routes: Object.fromEntries(routed) };
    }
    const groupFiles = Object.fromEntries(groups.map((group, idx) => [group, idx]));
    return {
      assets: Object.fromEntries(assets),
      groups: apiFile === null ? groupFiles : { ...groupFiles, [apiGroup]: apiFile },
    };
  }

  //? Sized on the default locale, whose texts every other locale's fill from: the same files hold the same groups.
  static #pack(
    routes: ReadonlyMap<string, readonly string[]>,
    locales: LocalePages[],
    defaultLocale: string,
    groups: string[],
  ) {
    const { lang = defaultLocale, page: sizing = {} } =
      locales.find((locale) => locale.lang === defaultLocale) ?? locales[0] ?? {};
    const servedBytesOf = (held: readonly string[]) => {
      const texts = Object.fromEntries(held.flatMap((group) => (sizing[group] ? [[group, sizing[group]]] : [])));
      return dictionaryBrotliBytesOf(DictionaryAssetBuilder.source(lang, texts));
    };
    const bytesOf = (group: string) => JSON.stringify(sizing[group] ?? {}).length;
    return DictionaryPacking.packUnderWhole(routes, bytesOf, groups, servedBytesOf);
  }

  //? The same module the root layout's macro evaluates in this process, so the asset and the RSC worker's copy agree.
  async #loadAllDictionary(): Promise<AllDictionary | null> {
    const dictPath = path.resolve(this.#app.cwdPath, "lib", "dict.ts");
    if (!(await Bun.file(dictPath).exists())) return null;
    const { getAllDictionary } = (await import(dictPath)) as { getAllDictionary?: () => AllDictionary };
    return getAllDictionary ? getAllDictionary() : null;
  }

  async #writeLocale({ lang, page, api }: LocalePages, packed?: string[][]): Promise<readonly [string, DictAsset]> {
    const { source, apiPart } = DictionaryAssetBuilder;
    const apiSource = source(lang, api, undefined, packed?.length ? { part: apiPart } : {});
    const apiAsset = Object.keys(api).length ? await this.#write(`${lang}-api`, apiSource) : null;
    const parts = apiAsset ? { [apiPart]: apiAsset.url } : undefined;
    const withParts = apiAsset ? { parts: { [apiPart]: apiAsset } } : {};
    if (!packed?.length) return [lang, { ...(await this.#write(lang, source(lang, page, parts))), ...withParts }];
    //? Named for what decides every file it lists, not for their names: each part names the table it belongs to.
    const tableName = `${lang}-groups-${Bun.hash(JSON.stringify([page, packed, parts ?? null])).toString(36)}.js`;
    const table = `${DictionaryAssetBuilder.urlPrefix}/${tableName}`;
    const groupFiles = await Promise.all(
      packed.map((groups, idx) => {
        const held = Object.fromEntries(groups.flatMap((group) => (page[group] ? [[group, page[group]]] : [])));
        return this.#write(`${lang}-${idx}`, source(lang, held, parts, { table, groups }));
      }),
    );
    const files = apiAsset ? [...groupFiles, apiAsset] : groupFiles;
    const groupIndex = Object.fromEntries(packed.flatMap((groups, idx) => groups.map((group) => [group, idx])));
    const tableSource = `export const lang = ${JSON.stringify(lang)};\nexport const files = ${JSON.stringify(files.map(({ url }) => url))};\nexport default ${JSON.stringify(groupIndex)};\n`;
    const tableAsset = await this.#write(lang, tableSource, tableName);
    const whole = await this.#write(lang, source(lang, page, parts, { table }));
    return [lang, { ...whole, ...withParts, routeParts: { table: tableAsset, files } }];
  }

  async #write(stem: string, source: string, fileName?: string): Promise<DictAsset> {
    const name = fileName ?? `${stem}-${Bun.hash(source).toString(36)}.js`;
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
  static source(
    lang: string,
    dictionary: object,
    parts?: Record<string, string>,
    { table, groups, part }: { table?: string; groups?: string[]; part?: string } = {},
  ): string {
    const lines = [
      `export const lang = ${JSON.stringify(lang)};\n`,
      parts ? `export const parts = ${JSON.stringify(parts)};\n` : "",
      table ? `export const table = ${JSON.stringify(table)};\n` : "",
      groups ? `export const groups = ${JSON.stringify(groups)};\n` : "",
      part ? `export const part = ${JSON.stringify(part)};\n` : "",
    ];
    return `${lines.join("")}export default JSON.parse(${JSON.stringify(JSON.stringify(dictionary))});\n`;
  }
}
