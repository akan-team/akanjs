import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { DictionarySizes } from "./dictionarySizes";

const tempRoot = tempDirs("akan-devkit-dict-sizes-");

describe("DictionarySizes", () => {
  test("counts a route whose files would cost more than the whole page file at the whole, the API file on top", async () => {
    const artifactDir = await tempRoot();
    await mkdir(path.join(artifactDir, "dict"), { recursive: true });
    const sized = { "en-page": 1000, "en-0": 600, "en-1": 500, "en-api": 200 };
    for (const [stem, bytes] of Object.entries(sized)) {
      await writeFile(path.join(artifactDir, `dict/${stem}.js`), "x".repeat(bytes * 4));
      await writeFile(path.join(artifactDir, `dict/${stem}.js.br`), "x".repeat(bytes));
    }
    const fileOf = (stem: string) => ({ url: `/_akan/dict/${stem}.js`, relPath: `dict/${stem}.js` });
    const artifact = {
      dictAssets: {
        en: {
          ...fileOf("en-page"),
          parts: { api: fileOf("en-api") },
          routeParts: { table: fileOf("en-groups"), files: [fileOf("en-0"), fileOf("en-1"), fileOf("en-api")] },
        },
      },
      dictRoutes: { "/:lang/light": [0], "/:lang/wide": [0, 1, 2] },
    };
    await writeFile(path.join(artifactDir, "base-artifact.json"), JSON.stringify(artifact));

    expect(DictionarySizes.of(artifactDir)).toEqual([
      {
        lang: "en",
        pageBrotliBytes: 1000,
        apiBrotliBytes: 200,
        routeBrotliBytes: { lightest: 600, median: 600, largest: 1200 },
      },
    ]);
  });
});
