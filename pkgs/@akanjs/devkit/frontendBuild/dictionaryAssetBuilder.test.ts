import { describe, expect, test } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs } from "../testHelpers";
import { DictionaryAssetBuilder } from "./dictionaryAssetBuilder";

const tempRoot = tempDirs("akan-devkit-dict-asset-");

const allDictionary = {
  en: { app: { title: { t: "Title" }, partial: { t: "Partial" } }, libOnly: { signin: { t: "Sign In" } } },
  ko: { app: { title: { t: "제목" } } },
};

const makeApp = async (dictSource?: string) => {
  const root = await tempRoot();
  const cwdPath = path.join(root, "apps/demo");
  await mkdir(path.join(cwdPath, "lib"), { recursive: true });
  if (dictSource) await writeFile(path.join(cwdPath, "lib/dict.ts"), dictSource);
  const app = { cwdPath, verbose: () => undefined } as unknown as App;
  return { app, artifactDir: path.join(root, "artifact") };
};

const dictSourceOf = (dictionary: object) => `export const getAllDictionary = () => (${JSON.stringify(dictionary)});\n`;

describe("DictionaryAssetBuilder", () => {
  test("writes one module per locale, the default locale's text filled into the gaps", async () => {
    const { app, artifactDir } = await makeApp(dictSourceOf(allDictionary));
    const assets = await new DictionaryAssetBuilder(app, artifactDir).build({
      defaultLocale: "en",
      locales: ["en", "ko"],
    });

    expect(Object.keys(assets)).toEqual(["en", "ko"]);
    expect(assets.ko.url).toMatch(/^\/_akan\/dict\/ko-[a-z0-9]+\.js$/);
    expect(assets.ko.url).toBe(`/_akan/${assets.ko.relPath}`);
    const ko = (await import(path.join(artifactDir, assets.ko.relPath))) as { lang: string; default: object };
    expect(ko.lang).toBe("ko");
    expect(ko.default).toEqual({
      app: { title: { t: "제목" }, partial: { t: "Partial" } },
      libOnly: { signin: { t: "Sign In" } },
    });
    const en = (await import(path.join(artifactDir, assets.en.relPath))) as { default: object };
    expect(en.default).toEqual(allDictionary.en);
  });

  test("takes the default locale from the config it is handed", async () => {
    const { app, artifactDir } = await makeApp(dictSourceOf(allDictionary));
    const assets = await new DictionaryAssetBuilder(app, artifactDir).build({
      defaultLocale: "ko",
      locales: ["en", "ko"],
    });
    const en = (await import(path.join(artifactDir, assets.en.relPath))) as { default: object };
    expect(en.default).toEqual(allDictionary.en);
    const ko = (await import(path.join(artifactDir, assets.ko.relPath))) as { default: object };
    expect(ko.default).toEqual(allDictionary.ko);
  });

  test("names a module by its content, so a rebuild of the same dictionary keeps the URL", async () => {
    const { app, artifactDir } = await makeApp(dictSourceOf(allDictionary));
    const i18n = { defaultLocale: "en", locales: ["en", "ko"] };
    const first = await new DictionaryAssetBuilder(app, artifactDir).build(i18n);
    const second = await new DictionaryAssetBuilder(app, artifactDir).build(i18n);
    expect(second).toEqual(first);
    expect((await readdir(path.join(artifactDir, "dict"))).length).toBe(2);
    expect(DictionaryAssetBuilder.source("en", { a: { t: "A" } })).not.toBe(
      DictionaryAssetBuilder.source("en", { a: { t: "B" } }),
    );
  });

  test("writes nothing for an app without a dictionary", async () => {
    const { app, artifactDir } = await makeApp();
    expect(await new DictionaryAssetBuilder(app, artifactDir).build({ defaultLocale: "en", locales: ["en"] })).toEqual(
      {},
    );
  });
});
