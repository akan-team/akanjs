import { afterAll, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DictionaryAsset } from "./dictionaryAsset";
import { DictionaryPart } from "./dictionaryPart";
import { Translator } from "./translator";
import { TranslatorState } from "./translatorState";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "akan-dictionary-part-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const scope = globalThis as unknown as Record<string, Promise<void> | number | undefined>;
const openGate = (name: string) => {
  const { promise, resolve } = Promise.withResolvers<void>();
  scope[name] = promise;
  return () => resolve();
};

let moduleSeq = 0;
interface DictFileOptions {
  parts?: Record<string, string>;
  gate?: string;
  counter?: string;
}
const writeDict = (lang: string, dictionary: object, { parts, gate, counter }: DictFileOptions = {}) => {
  const file = path.join(root, `${lang}-${++moduleSeq}.js`);
  fs.writeFileSync(
    file,
    [
      counter ? `globalThis.${counter} = (globalThis.${counter} ?? 0) + 1;` : "",
      gate ? `await globalThis.${gate};` : "",
      `export const lang = ${JSON.stringify(lang)};`,
      parts ? `export const parts = ${JSON.stringify(parts)};` : "",
      `export default JSON.parse(${JSON.stringify(JSON.stringify(dictionary))});`,
    ].join("\n"),
  );
  return file;
};
const pingPage = (title: string) => ({ app: { title: { t: title }, signal: { ping: { t: "Ping" } } } });
const pingApi = (desc: string) => ({ app: { signal: { ping: { desc: { t: desc }, arg: { to: { t: "To" } } } } } });
const descOf = (lang: string) => Translator.translateByLocale(lang, "app.signal.ping.desc");
const { api } = DictionaryPart;
const isSettled = (lang: string) => DictionaryPart.ready(lang, api).status === "fulfilled";

describe("DictionaryPart", () => {
  test("merges a locale's API file where a page asks for it, importing it once", async () => {
    const apiFile = writeDict("xa", pingApi("Sends a ping"), { counter: "__xaApi" });
    const page = writeDict("xa", pingPage("Title"), { parts: { api: apiFile } });
    await DictionaryAsset.load(page);

    expect(descOf("xa")).toBe("app.signal.ping.desc");
    const first = DictionaryPart.ready("xa", api);
    expect(DictionaryPart.ready("xa", api)).toBe(first);
    expect(isSettled("xa")).toBe(false);
    await first;

    expect(DictionaryPart.ready("xa", api)).toBe(first);
    expect(isSettled("xa")).toBe(true);
    expect(descOf("xa")).toBe("Sends a ping");
    expect(Translator.translateByLocale("xa", "app.signal.ping.arg.to")).toBe("To");
    expect(Translator.translateByLocale("xa", "app.signal.ping")).toBe("Ping");
    expect(Translator.translateByLocale("xa", "app.title")).toBe("Title");
    await DictionaryAsset.load(page);
    expect(isSettled("xa")).toBe(true);
    expect(descOf("xa")).toBe("Sends a ping");
    expect(scope.__xaApi).toBe(1);
  });

  test("is ready at once for a locale whose file left nothing out", async () => {
    await DictionaryAsset.load(writeDict("xb", { app: { signal: { ping: { t: "Ping", desc: { t: "Whole" } } } } }));

    expect(isSettled("xb")).toBe(true);
    expect(DictionaryPart.urlOf("xb", api)).toBeUndefined();
    expect(descOf("xb")).toBe("Whole");
  });

  test("merges the same file once, and nothing onto a snapshot its locale has left", () => {
    const base = { app: { title: { t: "Base" } } };
    TranslatorState.replace("xc", base);

    expect(DictionaryPart.merge("xc", "/a.js", { app: { signal: { t: "A" } } }, base)).toBe(true);
    expect(DictionaryPart.merge("xc", "/a.js", { app: { signal: { t: "A again" } } }, base)).toBe(true);
    expect(Translator.translateByLocale("xc", "app.signal")).toBe("A");
    expect(DictionaryPart.merge("xc", "/b.js", { app: { signal: { t: "B" } } }, { app: {} })).toBe(false);
    expect(Translator.translateByLocale("xc", "app.signal")).toBe("A");
    expect(base).toEqual({ app: { title: { t: "Base" } } });
  });

  test("drops an API file that answers after its locale moved to another build", async () => {
    const release = openGate("__xdGate");
    const apiFile = writeDict("xd", pingApi("Old build"), { gate: "__xdGate" });
    await DictionaryAsset.load(writeDict("xd", pingPage("Old"), { parts: { api: apiFile } }));
    const part = DictionaryPart.ready("xd", api);
    await DictionaryAsset.load(writeDict("xd", pingPage("New")));
    release();
    await part;

    expect(Translator.translateByLocale("xd", "app.title")).toBe("New");
    expect(descOf("xd")).toBe("app.signal.ping.desc");
  });

  test("loads the API file again for a build put back mid-deploy", async () => {
    const older = writeDict("xe", pingPage("Older"), { parts: { api: writeDict("xe", pingApi("Older build")) } });
    await DictionaryAsset.load(older);
    await DictionaryPart.ready("xe", api);
    await DictionaryAsset.load(writeDict("xe", pingPage("Newer")));
    await DictionaryAsset.load(older);

    expect(descOf("xe")).toBe("app.signal.ping.desc");
    await DictionaryPart.ready("xe", api);
    expect(descOf("xe")).toBe("Older build");
  });

  test("keeps each language's files to that language across a switch and back", async () => {
    const enPage = writeDict("xf", pingPage("Title"), { parts: { api: writeDict("xf", pingApi("Sends a ping")) } });
    const koPage = writeDict("xg", pingPage("제목"), { parts: { api: writeDict("xg", pingApi("핑을 보낸다")) } });
    await DictionaryAsset.load(enPage);
    await DictionaryPart.ready("xf", api);
    await DictionaryAsset.load(koPage);

    expect(isSettled("xg")).toBe(false);
    await DictionaryPart.ready("xg", api);
    expect(descOf("xg")).toBe("핑을 보낸다");
    await DictionaryAsset.load(enPage);
    expect(isSettled("xf")).toBe(true);
    expect(descOf("xf")).toBe("Sends a ping");
  });

  test("retries an API file that failed once, and settles without one that failed twice", async () => {
    const flaky = path.join(root, "xh-api-flaky.js");
    fs.writeFileSync(
      flaky,
      `globalThis.__xhFlaky = (globalThis.__xhFlaky ?? 0) + 1;
if (globalThis.__xhFlaky === 1) throw new Error("network");
export const lang = "xh";
export default ${JSON.stringify(pingApi("Sends a ping"))};`,
    );
    await DictionaryAsset.load(writeDict("xh", pingPage("Title"), { parts: { api: flaky } }));
    await DictionaryPart.ready("xh", api);
    expect(descOf("xh")).toBe("Sends a ping");

    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const missing = path.join(root, "xi-api-missing.js");
    await DictionaryAsset.load(writeDict("xi", pingPage("Title"), { parts: { api: missing } }));
    await expect(DictionaryPart.ready("xi", api)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
    expect(isSettled("xi")).toBe(true);
    expect(DictionaryPart.has("xi", missing)).toBe(false);
  });

  test("tries a file that failed again at the next navigation, never when a reader on the same page re-renders", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const late = path.join(root, "xj-api-late.js");
    const page = writeDict("xj", pingPage("Title"), { parts: { api: late } });
    await DictionaryAsset.load(page);
    const failed = DictionaryPart.ready("xj", api);
    await failed;
    error.mockRestore();
    fs.writeFileSync(late, `export const lang = "xj";\nexport default ${JSON.stringify(pingApi("Sends a ping"))};`);

    expect(DictionaryPart.ready("xj", api)).toBe(failed);
    expect(descOf("xj")).toBe("app.signal.ping.desc");
    await DictionaryAsset.load(page);
    const retried = DictionaryPart.ready("xj", api);
    expect(retried).not.toBe(failed);
    await retried;
    expect(descOf("xj")).toBe("Sends a ping");
    expect(DictionaryPart.ready("xj", api)).toBe(retried);
  });
});
