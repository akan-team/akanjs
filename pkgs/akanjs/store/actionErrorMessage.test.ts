import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Translator } from "akanjs/client";
import { DictionaryAsset } from "../client/dictionaryAsset";
import { DictionaryGroups } from "../client/dictionaryGroups";
import { showActionErrorMessage } from "./actionErrorMessage";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-action-error-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
DictionaryGroups.install();

const writePart = (lang: string, table: string, group: string, dictionary: object) => {
  const file = path.join(root, `${lang}-${group}.js`);
  fs.writeFileSync(
    file,
    `export const lang = ${JSON.stringify(lang)}; export const table = ${JSON.stringify(table)};
export const groups = [${JSON.stringify(group)}]; export default ${JSON.stringify({ [group]: dictionary })};`,
  );
  return file;
};

describe("showActionErrorMessage", () => {
  test("shows an error of a module the route's files left out once its texts load, never its raw key", async () => {
    const table = path.join(root, "zb-groups.js");
    const base = writePart("zb", table, "base", { t: "Base", error: { failed: { t: "Failed" } } });
    const memo = writePart("zb", table, "memo", { error: { notFound: { t: "No memo {id}" } } });
    fs.writeFileSync(
      table,
      `export const files = ${JSON.stringify([base, memo])}; export default { base: 0, memo: 1 };`,
    );
    await DictionaryAsset.load(base);
    Translator.setActiveLocale("zb");
    const shown: string[] = [];

    showActionErrorMessage({ error: "base.error.failed" }, (content) => shown.push(content));
    expect(shown).toEqual(["Failed"]);

    showActionErrorMessage({ error: "memo.error.notFound", data: { id: "m1" } }, (content) => shown.push(content));
    expect(shown).toEqual(["Failed"]);
    await Translator.ready("zb", "memo.error.notFound");
    await Promise.resolve();
    expect(shown).toEqual(["Failed", "No memo m1"]);
  });
});
