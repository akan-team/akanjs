import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SysExecutor } from "@akanjs/devkit/executors";
import { ThemeValidator } from "@akanjs/devkit/frontendBuild/themeValidator";
import { isolateEnv, makeCliTempWorkspace, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import { Glob } from "bun";
import taskSignalTemplate from "../templates/appSample/lib/task/task.signal";
import guardsTemplate from "../templates/appSample/srvkit/guards";
import facetIndex from "../templates/facetIndex/index";

const sampleRoot = path.join(import.meta.dir, "../templates/appSample");
const facets = ["ui", "webkit", "srvkit", "common", "plugin"].filter((facet) =>
  existsSync(path.join(sampleRoot, facet)),
);

const sampleFilenames = async (facet: string) => {
  const templates = [...new Glob("*.{ts,tsx}").scanSync({ cwd: path.join(sampleRoot, facet) })];
  return await Promise.all(
    templates.map(async (template) => {
      const { default: getContent } = await import(path.join(sampleRoot, facet, template));
      return (await getContent(null, { appName: "myapp" })).filename as string;
    }),
  );
};

describe("appSample", () => {
  test("the generated barrel of each facet exports every file the sample writes into it", async () => {
    for (const facet of facets) {
      const filenames = await sampleFilenames(facet);
      if (!filenames.length) continue;
      const exec = { exists: async () => true, getFilesAndDirs: async () => ({ files: filenames, dirs: [] }) };
      const barrel = await facetIndex(null, {}, { exec: exec as unknown as SysExecutor, facet });
      for (const filename of filenames)
        expect(barrel?.content ?? "").toContain(`export * from "./${filename.replace(/\.tsx?$/, "")}";`);
    }
  });

  describe("task writes", () => {
    isolateEnv();
    const track = tempRoots();

    test("are open to guests only while the app runs locally or under test", async () => {
      const { root } = track(await makeCliTempWorkspace());
      const guardsPath = path.join(root, "guards.ts");
      await writeText(guardsPath, guardsTemplate(null, { appName: "myapp" }).content);
      const { LocalOrSignedIn } = (await import(guardsPath)) as {
        LocalOrSignedIn: new () => { canPass: (context: unknown) => boolean };
      };
      const contextOf = (account: unknown) => ({ get: () => account });
      const passes = (environment: string, account: unknown) => {
        process.env.AKAN_PUBLIC_ENV = environment;
        return new LocalOrSignedIn().canPass(contextOf(account));
      };
      const guest = { appName: "myapp", environment: "main" };

      expect(passes("local", guest)).toBe(true);
      expect(passes("testing", undefined)).toBe(true);
      for (const environment of ["debug", "develop", "main"]) {
        expect(passes(environment, guest)).toBe(false);
        expect(passes(environment, { self: { id: "user-1" } })).toBe(true);
      }
      const signal = taskSignalTemplate(null, { appName: "myapp" });
      expect(signal).toContain('import { LocalOrSignedIn } from "@apps/myapp/srvkit";');
      expect(signal).toContain("cru: LocalOrSignedIn");
      expect(signal).not.toMatch(/mutation\(cnst\.Task, \{ guards: \[Public\] \}\)/);
    });
  });

  describe("in the first app", () => {
    const track = tempRoots();
    const scaffold = async ({ sample }: { sample: boolean }) => {
      const { root, workspace } = track(await makeCliTempWorkspace());
      const app = { basePath: "apps/myapp", dict: { appName: "myapp" }, options: { libs: [] } };
      await workspace.applyTemplate({ ...app, template: "app" });
      if (sample) await workspace.applyTemplate({ ...app, template: "appSample" });
      const appRoot = path.join(root, "apps/myapp");
      const files = [...new Glob("**/*").scanSync({ cwd: appRoot })].sort();
      return { files, read: (file: string) => readFile(path.join(appRoot, file), "utf8") };
    };
    const tokenNamesOf = (css: string) =>
      Object.fromEntries(
        Object.entries(ThemeValidator.parseThemeTokens(css)).map(([scope, tokens]) => [scope, Object.keys(tokens)]),
      );

    test("is left out entirely: the app gets a plain home, a layout without fonts, and the theme tokens alone", async () => {
      const { files, read } = await scaffold({ sample: false });
      const css = await read("page/styles.css");
      const frameworkCss = await readFile(Bun.resolveSync("akanjs/ui/styles.css", import.meta.dir), "utf8");

      expect(files.filter((file) => /^(page|public|ui)\//.test(file))).toEqual([
        "page/_index.tsx",
        "page/_layout.tsx",
        "page/styles.css",
        "public/apple-touch-icon.png",
        "public/favicon.ico",
      ]);
      expect(await read("page/_layout.tsx")).not.toContain(".fonts(");
      expect(await read("page/_index.tsx")).not.toContain("@apps/myapp/ui");
      expect(tokenNamesOf(css)).toEqual(tokenNamesOf(frameworkCss));
      expect(new ThemeValidator().validate(css)).toEqual([]);
      expect(css).not.toMatch(/@(utility|keyframes|theme)\b/);
    });

    test("brings the demo home, its jelly theme and button, and every font face its layout declares", async () => {
      const { files, read } = await scaffold({ sample: true });
      const fontFiles = [...(await read("page/_layout.tsx")).matchAll(/src: "\/(fonts\/[\w-]+\.woff2)"/g)].map(
        ([, src]) => `public/${src}`,
      );

      expect(fontFiles).toHaveLength(9);
      expect(files).toEqual(
        expect.arrayContaining([
          ...fontFiles,
          "page/_overrides.tsx",
          "public/jelly/star.webp",
          "public/jelly/sugar.webp",
          "public/logo.png",
          "ui/Recipe/index.ts",
          "ui/Recipe/jellyButton.ts",
        ]),
      );
      expect(await read("page/_index.tsx")).toContain('href="/task"');
      expect(await read("page/styles.css")).toContain("@utility jelly {");
    });
  });
});
