import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DictionaryAsset } from "./dictionaryAsset";
import { DictionaryPart } from "./dictionaryPart";
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

  test("keeps the newer file of a locale when one asked for earlier answers last", async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    (globalThis as { __dictGate?: Promise<void> }).__dictGate = gate;
    const left = path.join(root, `xa-${++moduleSeq}.js`);
    fs.writeFileSync(
      left,
      `await globalThis.__dictGate;
export const lang = "xa";
export default { app: { title: { t: "Page left" } } };`,
    );
    const leaving = DictionaryAsset.load(left);
    await DictionaryAsset.load(writeModule("xa", "Page shown"));
    release();
    await leaving;

    expect(Translator.translateByLocale("xa", "app.title")).toBe("Page shown");
  });

  describe("a route's files", () => {
    const writePart = (lang: string, table: string, groups: Record<string, string>) => {
      const file = path.join(root, `${lang}-part-${++moduleSeq}.js`);
      const dictionary = Object.fromEntries(Object.entries(groups).map(([group, title]) => [group, { t: title }]));
      fs.writeFileSync(
        file,
        `globalThis.__dictEvaluations = (globalThis.__dictEvaluations ?? 0) + 1;
export const lang = ${JSON.stringify(lang)};
export const table = ${JSON.stringify(table)};
export const groups = ${JSON.stringify(Object.keys(groups))};
export default ${JSON.stringify(dictionary)};`,
      );
      return file;
    };

    test("merges every file a route names, as the document and the RSC response list them", async () => {
      const table = path.join(root, "xb-table-1.js");
      const base = writePart("xb", table, { base: "Base" });
      const memo = writePart("xb", table, { memo: "Memo" });

      await DictionaryAsset.load(`${base},${memo}`);

      expect(Translator.translateByLocale("xb", "base")).toBe("Base");
      expect(Translator.translateByLocale("xb", "memo")).toBe("Memo");
      expect(DictionaryAsset.holdsEveryGroup("xb")).toBe(false);
    });

    test("a navigation loads only the next route's new files, and keeps the groups merged before", async () => {
      const table = path.join(root, "xc-table-1.js");
      const base = writePart("xc", table, { base: "Base" });
      const memo = writePart("xc", table, { memo: "Memo" });
      const user = writePart("xc", table, { user: "User" });
      await DictionaryAsset.load([base, memo]);
      const before = evaluations();

      await DictionaryAsset.load([base, user]);

      expect(evaluations() - before).toBe(1);
      expect(Translator.translateByLocale("xc", "memo")).toBe("Memo");
      expect(Translator.translateByLocale("xc", "user")).toBe("User");
    });

    test("a file of another build replaces the locale, dropping the groups the old build's files merged", async () => {
      const oldMemo = writePart("xd", path.join(root, "xd-table-old.js"), { memo: "Old memo", user: "Old user" });
      await DictionaryAsset.load(oldMemo);

      await DictionaryAsset.load(writePart("xd", path.join(root, "xd-table-new.js"), { memo: "New memo" }));

      expect(Translator.translateByLocale("xd", "memo")).toBe("New memo");
      expect(Translator.translateByLocale("xd", "user")).toBe("user");
    });

    test("a language switch loads the route's files of the new language beside the old one's", async () => {
      await DictionaryAsset.load(writePart("xe", path.join(root, "xe-table.js"), { memo: "Memo" }));

      await DictionaryAsset.load(writePart("xf", path.join(root, "xf-table.js"), { memo: "메모" }));

      expect(Translator.translateByLocale("xe", "memo")).toBe("Memo");
      expect(Translator.translateByLocale("xf", "memo")).toBe("메모");
    });

    test("a page file of the same build holds every group, so a route's file adds nothing to it", async () => {
      const table = path.join(root, "xg-table.js");
      const page = path.join(root, `xg-page-${++moduleSeq}.js`);
      fs.writeFileSync(
        page,
        `export const lang = "xg";
export const table = ${JSON.stringify(table)};
export default { base: { t: "Base" }, memo: { t: "Memo" } };`,
      );
      await DictionaryAsset.load(page);

      expect(DictionaryAsset.holdsEveryGroup("xg")).toBe(true);
      expect(await DictionaryAsset.add(writePart("xg", table, { memo: "Memo from a part" }))).toBe(true);
      expect(Translator.translateByLocale("xg", "memo")).toBe("Memo");
    });

    test("merges the API description file a route lists after its files onto their build, and drops another build's", async () => {
      const api = path.join(root, `xi-api-${++moduleSeq}.js`);
      const stale = path.join(root, `xi-api-${++moduleSeq}.js`);
      const apiSource = (title: string) =>
        `export const lang = "xi"; export const part = "api";
export default { memo: { signal: { getMemo: { desc: { t: ${JSON.stringify(title)} } } } } };`;
      fs.writeFileSync(api, apiSource("Reads a memo"));
      fs.writeFileSync(stale, apiSource("Reads an old memo"));
      const memo = path.join(root, `xi-part-${++moduleSeq}.js`);
      fs.writeFileSync(
        memo,
        `export const lang = "xi"; export const parts = { api: ${JSON.stringify(api)} };
export const table = ${JSON.stringify(path.join(root, "xi-table.js"))}; export const groups = ["memo"];
export default { memo: { t: "Memo", signal: { getMemo: { t: "Get memo" } } } };`,
      );

      await DictionaryAsset.load([memo, api]);
      await DictionaryAsset.load([memo, stale]);

      expect(Translator.translateByLocale("xi", "memo")).toBe("Memo");
      expect(Translator.translateByLocale("xi", "memo.signal.getMemo")).toBe("Get memo");
      expect(Translator.translateByLocale("xi", "memo.signal.getMemo.desc")).toBe("Reads a memo");
      expect(DictionaryPart.has("xi", api)).toBe(true);
    });

    test("applies the files that loaded when one fails, and the failed one loads on the next try", async () => {
      const table = path.join(root, "xh-table.js");
      const base = writePart("xh", table, { base: "Base" });
      const late = path.join(root, `xh-late-${++moduleSeq}.js`);

      await expect(DictionaryAsset.load([base, late])).rejects.toThrow();
      expect(Translator.translateByLocale("xh", "base")).toBe("Base");
      fs.writeFileSync(
        late,
        `export const lang = "xh"; export const table = ${JSON.stringify(table)}; export const groups = ["memo"];
export default { memo: { t: "Memo" } };`,
      );
      await DictionaryAsset.load([base, late]);

      expect(Translator.translateByLocale("xh", "memo")).toBe("Memo");
    });
  });
});
