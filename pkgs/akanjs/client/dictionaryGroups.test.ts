import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DictionaryAsset } from "./dictionaryAsset";
import { DictionaryGroups } from "./dictionaryGroups";
import { Translator } from "./translator";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-dictionary-groups-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
DictionaryGroups.install();

const scope = globalThis as { window?: unknown; __groupFetches?: string[] };
afterEach(() => {
  delete scope.window;
});
const fetches = () => scope.__groupFetches ?? [];

const writeBuild = (lang: string, groups: Record<string, string>) => {
  const table = path.join(root, `${lang}-groups.js`);
  const files = Object.entries(groups).map(([group, title]) => {
    const file = path.join(root, `${lang}-${group}.js`);
    fs.writeFileSync(
      file,
      `(globalThis.__groupFetches ??= []).push(${JSON.stringify(`${lang}-${group}`)});
export const lang = ${JSON.stringify(lang)};
export const table = ${JSON.stringify(table)};
export const groups = [${JSON.stringify(group)}];
export default ${JSON.stringify({ [group]: { t: title, modelName: { t: `${title} name` } } })};`,
    );
    return file;
  });
  fs.writeFileSync(
    table,
    `export const files = ${JSON.stringify(files)};
export default ${JSON.stringify(Object.fromEntries(Object.keys(groups).map((group, idx) => [group, idx])))};`,
  );
  return files;
};

describe("DictionaryGroups", () => {
  test("a key of a group the route's files left out loads that group's file, and the text shows once it merges", async () => {
    const [base] = writeBuild("ya", { base: "Base", memo: "Memo", user: "User" });
    await DictionaryAsset.load(base);

    expect(Translator.translateByLocale("ya", "memo.modelName")).toBe("memo.modelName");
    const ready = Translator.ready("ya", "memo.modelName");
    expect(ready).toBeInstanceOf(Promise);
    expect(await ready).toBe(true);

    expect(Translator.translateByLocale("ya", "memo.modelName")).toBe("Memo name");
    expect(Translator.ready("ya", "memo.modelName")).toBeNull();
    expect(fetches().filter((name) => name.startsWith("ya-"))).toEqual(["ya-base", "ya-memo"]);
  });

  test("waits on nothing for a merged group, a text with no group, a locale holding a page file or a build with no table", async () => {
    const [base] = writeBuild("yb", { base: "Base", memo: "Memo" });
    await DictionaryAsset.load(base);
    const page = path.join(root, "yc-page.js");
    fs.writeFileSync(
      page,
      `export const lang = "yc"; export const table = ${JSON.stringify(path.join(root, "yc-groups.js"))};
export default { base: { t: "Base" } };`,
    );
    await DictionaryAsset.load(page);
    const plain = path.join(root, "yd-page.js");
    fs.writeFileSync(plain, `export const lang = "yd"; export default { base: { t: "Base" } };`);
    await DictionaryAsset.load(plain);

    expect(DictionaryGroups.pending("yb", "base.modelName")).toBeNull();
    expect(DictionaryGroups.pending("yb", "Just a sentence")).toBeNull();
    expect(DictionaryGroups.pending("yc", "memo.modelName")).toBeNull();
    expect(DictionaryGroups.pending("yd", "memo.modelName")).toBeNull();
  });

  test("a group the table does not name resolves false without loading a file", async () => {
    const [base] = writeBuild("ye", { base: "Base" });
    await DictionaryAsset.load(base);
    const before = fetches().length;

    expect(await DictionaryGroups.pending("ye", "Hello. A sentence.")).toBe(false);
    expect(fetches().length).toBe(before);
  });

  test("a rendered miss renders the page again once its group merges, and development reports it once per group", async () => {
    scope.window = globalThis;
    const [base] = writeBuild("yf", { base: "Base", memo: "Memo" });
    await DictionaryAsset.load(base);
    let renders = 0;
    const stop = DictionaryGroups.onMerged(() => renders++);
    const reports = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      Translator.translateByLocale("yf", "memo.modelName");
      Translator.translateByLocale("yf", "memo.other");
      await DictionaryGroups.pending("yf", "memo.modelName");
      await Promise.resolve();

      expect(renders).toBe(1);
      const messages = reports.mock.calls.map(([fault]) => String(fault));
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(`"memo.modelName" was shown on a route whose dictionary files leave out "memo"`);
    } finally {
      stop();
      reports.mockRestore();
    }
  });

  test("production neither reports nor throws, and a table that fails to load resolves false and is asked for again", async () => {
    scope.window = globalThis;
    const missing = path.join(root, "yg-missing-groups.js");
    const part = path.join(root, "yg-base.js");
    fs.writeFileSync(
      part,
      `export const lang = "yg"; export const table = ${JSON.stringify(missing)}; export const groups = ["base"];
export default { base: { t: "Base" } };`,
    );
    await DictionaryAsset.load(part);
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const reports = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(Translator.translateByLocale("yg", "memo.modelName")).toBe("memo.modelName");
      expect(await DictionaryGroups.pending("yg", "memo.modelName")).toBe(false);
      expect(reports.mock.calls.map(([message]) => String(message))).toEqual([
        expect.stringContaining(`[DictionaryGroups] "memo" failed to load`),
      ]);

      const memo = path.join(root, "yg-memo.js");
      fs.writeFileSync(
        memo,
        `export const lang = "yg"; export const table = ${JSON.stringify(missing)}; export const groups = ["memo"];
export default { memo: { modelName: { t: "Memo name" } } };`,
      );
      fs.writeFileSync(
        missing,
        `export const files = ${JSON.stringify([part, memo])}; export default { base: 0, memo: 1 };`,
      );
      await DictionaryAsset.load(part);
      expect(await DictionaryGroups.pending("yg", "memo.modelName")).toBe(true);
      expect(Translator.translateByLocale("yg", "memo.modelName")).toBe("Memo name");
      expect(reports).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = nodeEnv;
      reports.mockRestore();
    }
  });
});
