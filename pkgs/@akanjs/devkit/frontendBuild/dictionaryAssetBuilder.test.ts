import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs } from "../test/testHelpers";
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

const workspaceRoot = path.resolve(import.meta.dir, "../../../..");
const i18n = { defaultLocale: "en", locales: ["en", "ko"] };

interface LocaleBuild {
  whole: Record<string, Record<string, unknown>>;
  page: Record<string, Record<string, unknown>>;
  api: Record<string, Record<string, unknown>>;
  parts: unknown;
  apiUrl: string;
  server: unknown;
}

//? In a process of its own: a sample app's `dict.ts` resolves `@libs/*` by the tsconfig its process read first.
const buildBothWays = async (cwdPath: string, outDir: string): Promise<Record<string, LocaleBuild>> => {
  const script = `
import path from "node:path";
import { DictionaryAssetBuilder } from ${JSON.stringify(path.join(import.meta.dir, "dictionaryAssetBuilder.ts"))};
import { WebArtifact } from ${JSON.stringify(path.join(workspaceRoot, "pkgs/akanjs/server/webArtifact.ts"))};
import { TranslatorState } from ${JSON.stringify(path.join(workspaceRoot, "pkgs/akanjs/client/translatorState.ts"))};
const app = { cwdPath: ${JSON.stringify(cwdPath)}, verbose: () => undefined };
const i18n = ${JSON.stringify(i18n)};
const wholeDir = ${JSON.stringify(path.join(outDir, "whole"))};
const splitDir = ${JSON.stringify(path.join(outDir, "split"))};
const whole = await new DictionaryAssetBuilder(app, wholeDir).build(i18n);
const split = await new DictionaryAssetBuilder(app, splitDir).build(i18n, { splitApi: true });
await WebArtifact.seedDictionaries({ dictAssets: split }, splitDir);
const result = {};
for (const lang of i18n.locales) {
  const page = await import(path.join(splitDir, split[lang].relPath));
  result[lang] = {
    whole: (await import(path.join(wholeDir, whole[lang].relPath))).default,
    page: page.default,
    parts: page.parts,
    api: (await import(path.join(splitDir, split[lang].parts.api.relPath))).default,
    apiUrl: split[lang].parts.api.url,
    server: TranslatorState.get().langDictionaryMap.get(lang),
  };
}
console.log(JSON.stringify(result));
`;
  const proc = Bun.spawn([process.execPath, "-e", script], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AKAN_PUBLIC_REPO_NAME: "repo",
      AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
      AKAN_PUBLIC_ENV: "local",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`the dictionary did not build:\n${stderr}`);
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as Record<string, LocaleBuild>;
};

const isNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const mergeOf = (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    [...new Set([...Object.keys(target), ...Object.keys(source)])].map((key) => {
      const [own, added] = [target[key], source[key]];
      return [key, isNode(own) && isNode(added) ? mergeOf(own, added) : (added ?? own)];
    }),
  );
const signalEntriesOf = (dictionary: Record<string, Record<string, unknown>>) =>
  Object.values(dictionary).flatMap((node) => (isNode(node.signal) ? Object.values(node.signal) : []));

const expectSplitOf = (build: LocaleBuild) => {
  expect(mergeOf(build.page, build.api)).toEqual(build.whole);
  expect(build.server).toEqual(build.whole);
  expect(build.parts).toEqual({ api: build.apiUrl });
  const pageEntries = signalEntriesOf(build.page).filter(isNode);
  expect(pageEntries.length).toBeGreaterThan(0);
  expect(pageEntries.filter((entry) => "desc" in entry || "arg" in entry)).toEqual([]);
  expect(Object.values(build.api).every((node) => Object.keys(node).join() === "signal")).toBe(true);
  const apiEntries = signalEntriesOf(build.api).filter(isNode);
  expect(apiEntries.length).toBeGreaterThan(0);
  expect(apiEntries.filter((entry) => Object.keys(entry).some((key) => key !== "desc" && key !== "arg"))).toEqual([]);
};

const libAndAppDictSource = (dictionaryIndex: string) => `
import { makeDictionary, makeTrans, registerServiceTrans, serviceDictionary } from ${JSON.stringify(dictionaryIndex)};
const libShop = serviceDictionary(["en", "ko"])
  .endpoint((fn) => ({
    order: fn(["Order", "주문"])
      .desc(["Places an order", "주문한다"])
      .arg((t) => ({ itemId: t(["Item", "상품"]).desc(["The item to order", "주문할 상품"]) })),
    refund: fn(["Refund", "환불"]).desc(["Refunds an order", "주문을 환불한다"]),
  }))
  .translate({ title: ["Shop", "상점"] });
const libCart = serviceDictionary(["en"]).endpoint((fn) => ({
  addItem: fn(["Add Item"]).desc(["Adds an item to the cart"]).arg((t) => ({ itemId: t(["Item"]) })),
}));
const appShop = serviceDictionary(["en", "ko"])
  .endpoint((fn) => ({
    order: fn(["Order now", "바로 주문"])
      .desc(["Places an order at once", "바로 주문한다"])
      .arg((t) => ({ coupon: t(["Coupon", "쿠폰"]).desc(["A coupon code", "쿠폰 코드"]) })),
    track: fn(["Track", "배송 조회"]),
  }))
  .translate({ title: ["My shop", "내 상점"] });
const lib = makeDictionary({ shop: registerServiceTrans(libShop), cart: registerServiceTrans(libCart) });
export const dictionary = makeDictionary(lib, { shop: registerServiceTrans(appShop) });
export const { getAllDictionary } = makeTrans(dictionary);
`;

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

  test("writes a locale's file as it always did when the API descriptions are not split out", async () => {
    const { app, artifactDir } = await makeApp(dictSourceOf(allDictionary));
    const assets = await new DictionaryAssetBuilder(app, artifactDir).build({ defaultLocale: "en", locales: ["en"] });

    expect(assets.en.parts).toBeUndefined();
    expect(await Bun.file(path.join(artifactDir, assets.en.relPath)).text()).toBe(
      `export const lang = "en";\nexport default JSON.parse(${JSON.stringify(JSON.stringify(allDictionary.en))});\n`,
    );
  });

  test("moves each endpoint's description and arguments to a file of their own, leaving its label", async () => {
    const dictionary = {
      en: {
        memo: {
          t: "Memo",
          title: { t: "Title", desc: { t: "A field's own description stays" } },
          signal: {
            createMemo: { t: "Create Memo", desc: { t: "Creates a memo" }, arg: { data: { t: "Data" } } },
            removeMemo: { t: "Remove Memo" },
          },
        },
        util: { t: "Util" },
      },
    };
    const { app, artifactDir } = await makeApp(dictSourceOf(dictionary));
    const assets = await new DictionaryAssetBuilder(app, artifactDir).build(
      { defaultLocale: "en", locales: ["en"] },
      { splitApi: true },
    );

    const api = assets.en.parts?.api;
    expect(api?.url).toMatch(/^\/_akan\/dict\/en-api-[a-z0-9]+\.js$/);
    const page = (await import(path.join(artifactDir, assets.en.relPath))) as { default: object; parts: object };
    expect(page.parts).toEqual({ api: api?.url });
    expect(page.default).toEqual({
      memo: {
        t: "Memo",
        title: { t: "Title", desc: { t: "A field's own description stays" } },
        signal: { createMemo: { t: "Create Memo" }, removeMemo: { t: "Remove Memo" } },
      },
      util: { t: "Util" },
    });
    expect((await import(path.join(artifactDir, api?.relPath ?? ""))).default).toEqual({
      memo: { signal: { createMemo: { desc: { t: "Creates a memo" }, arg: { data: { t: "Data" } } } } },
    });
  });

  test("writes the whole file when the split leaves nothing to move", async () => {
    const { app, artifactDir } = await makeApp(dictSourceOf(allDictionary));
    const assets = await new DictionaryAssetBuilder(app, artifactDir).build(i18n, { splitApi: true });

    expect(assets.en.parts).toBeUndefined();
    expect((await readdir(path.join(artifactDir, "dict"))).length).toBe(2);
  });

  test("splits a lib's and an app's description of the same module into files that merge back to the whole", async () => {
    const { app } = await makeApp(libAndAppDictSource(path.join(workspaceRoot, "pkgs/akanjs/dictionary/index.ts")));
    const builds = await buildBothWays(app.cwdPath, await tempRoot());

    expect(Object.keys(builds)).toEqual(["en", "ko"]);
    for (const build of Object.values(builds)) expectSplitOf(build);
    expect(builds.ko.whole.cart).toEqual(builds.en.whole.cart);
    expect(builds.ko.page.shop).toEqual({
      error: {},
      signal: { order: { t: "바로 주문" }, track: { t: "배송 조회" } },
      title: { t: "내 상점" },
    });
  }, 30_000);

  //? `lib/dict.ts` is written by `akan sync`, which the package test job of CI does not run.
  for (const name of ["minimal", "akan"])
    test.skipIf(!existsSync(path.join(workspaceRoot, "apps", name, "lib/dict.ts")))(
      `splits apps/${name}'s dictionary into files that merge back to the whole`,
      async () => {
        const builds = await buildBothWays(path.join(workspaceRoot, "apps", name), await tempRoot());

        expect(Object.keys(builds)).toEqual(["en", "ko"]);
        for (const build of Object.values(builds)) expectSplitOf(build);
      },
      60_000,
    );

  describe("for the routes it is handed", () => {
    const routedDictionary = {
      en: {
        base: { t: "Base", ok: { t: "OK" } },
        memo: { t: "Memo", signal: { getMemo: { t: "Get Memo", desc: { t: "Reads a memo" } } } },
        user: { t: "User" },
        util: { t: "Util" },
      },
      ko: { base: { t: "기본" }, memo: { t: "메모" } },
    };
    const routes = new Map([
      ["/:lang/memo", ["base", "memo"]],
      ["/:lang/user", ["base", "user", "unknownGroup"]],
    ]);
    interface PartModule {
      default: Record<string, unknown>;
      groups: string[];
      table: string;
      parts?: object;
    }
    const importOf = async <Module>(artifactDir: string, url: string) =>
      (await import(path.join(artifactDir, url.replace(/^\/_akan\//, "")))) as Module;

    test("writes the files each route loads, and the table naming each group's file, for every locale", async () => {
      const { app, artifactDir } = await makeApp(dictSourceOf(routedDictionary));
      const built = await new DictionaryAssetBuilder(app, artifactDir).buildAll(i18n, { splitApi: true, routes });

      expect(Object.keys(built.routes ?? {})).toEqual(["/:lang/memo", "/:lang/user"]);
      for (const lang of i18n.locales) {
        const asset = built.assets[lang];
        const routeParts = asset?.routeParts;
        if (!asset || !routeParts) throw new Error(`no route files for ${lang}`);
        const table = await importOf<{ files: string[]; default: Record<string, number> }>(
          artifactDir,
          routeParts.table.url,
        );
        expect(table.files).toEqual(routeParts.files.map(({ url }) => url));
        const page = await importOf<PartModule>(artifactDir, asset.url);
        expect(page.table).toBe(routeParts.table.url);
        for (const [routeId, shown] of routes) {
          const merged: Record<string, unknown> = {};
          for (const idx of built.routes?.[routeId] ?? []) {
            const part = await importOf<PartModule>(artifactDir, table.files[idx] ?? "");
            expect(part.table).toBe(routeParts.table.url);
            expect(part.parts).toEqual(page.parts);
            for (const group of part.groups) expect(table.default[group]).toBe(idx);
            Object.assign(merged, part.default);
          }
          for (const group of shown.filter((group) => group in page.default))
            expect(merged[group]).toEqual(page.default[group]);
          expect(merged.util).toBeUndefined();
        }
        expect(Object.keys(table.default).sort()).toEqual(["base", "memo", "user", "util"]);
        expect(built.routes?.["/:lang/memo"]).not.toContain(table.default.util);
        expect(built.routes?.["/:lang/user"]).not.toContain(table.default.util);
      }
    });

    test("writes the one page file unchanged when no route is handed", async () => {
      const { app, artifactDir } = await makeApp(dictSourceOf(routedDictionary));
      const plain = await new DictionaryAssetBuilder(app, path.join(artifactDir, "plain")).buildAll(i18n, {
        splitApi: true,
      });
      const routed = await new DictionaryAssetBuilder(app, path.join(artifactDir, "routed")).buildAll(i18n, {
        splitApi: true,
        routes: new Map(),
      });

      expect(routed).toEqual(plain);
      expect(plain.routes).toBeUndefined();
      expect(plain.assets.en.routeParts).toBeUndefined();
      expect((await readdir(path.join(artifactDir, "plain/dict"))).length).toBe(4);
      const api = await importOf<{ part?: string }>(
        path.join(artifactDir, "plain"),
        plain.assets.ko.parts?.api?.url ?? "",
      );
      expect(api.part).toBeUndefined();
    });

    test("adds the API description file to a route whose components show those texts, in a build and in development", async () => {
      const { app, artifactDir } = await makeApp(dictSourceOf(routedDictionary));
      const { apiGroup } = DictionaryAssetBuilder;
      const withApi = new Map([...routes, ["/:lang/memo/api", ["base", "memo", apiGroup]]]);
      const built = await new DictionaryAssetBuilder(app, path.join(artifactDir, "build")).buildAll(i18n, {
        splitApi: true,
        routes: withApi,
      });
      const dev = await new DictionaryAssetBuilder(app, path.join(artifactDir, "dev")).buildAll(i18n, {
        splitApi: true,
        everyGroupAlone: true,
      });

      for (const { assets } of [built, dev])
        for (const lang of i18n.locales) expect(assets[lang].routeParts?.files.at(-1)).toEqual(assets[lang].parts?.api);
      const apiIdx = (built.assets.en.routeParts?.files.length ?? 0) - 1;
      expect(built.routes?.["/:lang/memo/api"]).toEqual([...(built.routes?.["/:lang/memo"] ?? []), apiIdx]);
      expect(built.routes?.["/:lang/memo"]).not.toContain(apiIdx);
      expect(dev.groups?.[apiGroup]).toBe((dev.assets.en.routeParts?.files.length ?? 0) - 1);
      const api = await importOf<{ part: string; default: object }>(
        path.join(artifactDir, "build"),
        built.assets.ko.parts?.api?.url ?? "",
      );
      expect(api.part).toBe(DictionaryAssetBuilder.apiPart);
      expect(api.default).toEqual({ memo: { signal: { getMemo: { desc: { t: "Reads a memo" } } } } });
    });

    test("development writes one file per group and the index of each, as each route's groups are read when it builds", async () => {
      const { app, artifactDir } = await makeApp(dictSourceOf(routedDictionary));
      const built = await new DictionaryAssetBuilder(app, artifactDir).buildAll(i18n, { everyGroupAlone: true });

      expect(built.routes).toBeUndefined();
      expect(built.groups).toEqual({ base: 0, memo: 1, user: 2, util: 3 });
      const files = built.assets.ko?.routeParts?.files ?? [];
      expect(files).toHaveLength(4);
      for (const [group, idx] of Object.entries(built.groups ?? {})) {
        const part = await importOf<PartModule>(artifactDir, files[idx]?.url ?? "");
        expect(part.groups).toEqual([group]);
        expect(Object.keys(part.default)).toEqual([group]);
      }
    });
  });

  test("writes nothing for an app without a dictionary", async () => {
    const { app, artifactDir } = await makeApp();
    expect(await new DictionaryAssetBuilder(app, artifactDir).build({ defaultLocale: "en", locales: ["en"] })).toEqual(
      {},
    );
  });
});
