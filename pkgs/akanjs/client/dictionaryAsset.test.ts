import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DictionaryAsset } from "./dictionaryAsset";
import { Translator } from "./translator";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-dictionary-asset-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

let moduleSeq = 0;
const writeModule = (lang: string, title: string) => {
  const file = path.join(root, `${lang}-${++moduleSeq}.js`);
  fs.writeFileSync(
    file,
    `globalThis.__dictEvaluations = (globalThis.__dictEvaluations ?? 0) + 1;
export const lang = ${JSON.stringify(lang)};
export default JSON.parse(${JSON.stringify(JSON.stringify({ app: { title: { t: title } } }))});`,
  );
  return file;
};
const evaluations = () => (globalThis as { __dictEvaluations?: number }).__dictEvaluations ?? 0;

describe("DictionaryAsset", () => {
  test("puts the module's locale into the Translator, importing a URL once", async () => {
    const url = writeModule("ko", "제목");
    const before = evaluations();

    await Promise.all([DictionaryAsset.load(url), DictionaryAsset.load(url)]);
    await DictionaryAsset.load(url);

    expect(evaluations() - before).toBe(1);
    expect(Translator.translateByLocale("ko", "app.title")).toBe("제목");
  });

  test("replaces a locale with a newer build's module", async () => {
    await DictionaryAsset.load(writeModule("ko", "옛 제목"));
    await DictionaryAsset.load(writeModule("ko", "새 제목"));

    expect(Translator.translateByLocale("ko", "app.title")).toBe("새 제목");
  });

  test("puts a locale back to a build it held before, as a tab may get mid-deploy", async () => {
    const older = writeModule("ko", "옛 제목");
    await DictionaryAsset.load(older);
    await DictionaryAsset.load(writeModule("ko", "새 제목"));
    await DictionaryAsset.load(older);

    expect(Translator.translateByLocale("ko", "app.title")).toBe("옛 제목");
  });

  test("imports a module whose first fetch failed again under a fresh URL", async () => {
    const url = path.join(root, "ja-flaky.js");
    fs.writeFileSync(
      url,
      `globalThis.__dictFlaky = (globalThis.__dictFlaky ?? 0) + 1;
if (globalThis.__dictFlaky === 1) throw new Error("network");
export const lang = "ja";
export default { app: { title: { t: "再試行" } } };`,
    );

    await DictionaryAsset.load(url);

    expect(Translator.translateByLocale("ja", "app.title")).toBe("再試行");
  });

  test("resolves at once for a page without a dictionary", async () => {
    await expect(DictionaryAsset.load(undefined)).resolves.toBeUndefined();
    await expect(DictionaryAsset.load(null)).resolves.toBeUndefined();
  });

  test("forgets a failed import, so a later load of the same URL tries again", async () => {
    const url = path.join(root, "ja-late.js");

    await expect(DictionaryAsset.load(url)).rejects.toThrow();
    fs.writeFileSync(url, `export const lang = "ja"; export default { app: { title: { t: "タイトル" } } };`);
    await DictionaryAsset.load(url);

    expect(Translator.translateByLocale("ja", "app.title")).toBe("タイトル");
  });
});
