import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { createBrowserDirnamePlugin } from "./browserDirnamePlugin";

const makeTempRoot = tempDirs("akan-devkit-browser-dirname-");

const build = async (entry: string) => {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: true,
    plugins: [createBrowserDirnamePlugin()],
  });
  expect(result.success).toBe(true);
  return (await Promise.all(result.outputs.map((output) => output.text()))).join("\n");
};

describe("createBrowserDirnamePlugin", () => {
  test("gives a vendor module its path from node_modules on, never the absolute one", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "node_modules/cjsdep/package.json"), '{ "name": "cjsdep", "main": "index.js" }\n');
    await writeText(
      path.join(root, "node_modules/cjsdep/index.js"),
      "module.exports = { dir: __dirname, file: __filename };\n",
    );
    await writeText(
      path.join(root, "node_modules/esmdep/package.json"),
      '{ "name": "esmdep", "type": "module", "main": "index.js" }\n',
    );
    await writeText(
      path.join(root, "node_modules/esmdep/index.js"),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture module's own source holds a template literal
      'export const dir = typeof __dirname !== "undefined" ? `${__dirname}/` : "browser";\n',
    );
    await writeText(path.join(root, "node_modules/esmdep/legacy.cjs"), "module.exports = __filename;\n");
    const entry = path.join(root, "entry.ts");
    await writeText(
      entry,
      'import cjs from "cjsdep";\nimport { dir } from "esmdep";\nimport legacy from "esmdep/legacy.cjs";\nconsole.info(cjs, dir, legacy);\n',
    );

    const output = await build(entry);

    expect(output).not.toContain(root);
    expect(output).not.toContain(realpathSync(root));
    expect(output).toContain('"/node_modules/cjsdep"');
    expect(output).toContain('"/node_modules/cjsdep/index.js"');
    expect(output).toContain('"/node_modules/esmdep/"');
    expect(output).toContain('"/node_modules/esmdep/legacy.cjs"');
  });

  test("leaves a module's own __dirname binding alone", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "node_modules/owndep/package.json"), '{ "name": "owndep", "main": "index.js" }\n');
    await writeText(
      path.join(root, "node_modules/owndep/index.js"),
      'const __dirname = "own-binding";\nmodule.exports = __dirname;\n',
    );
    const entry = path.join(root, "entry.ts");
    await writeText(entry, 'import own from "owndep";\nconsole.info(own);\n');

    const output = await build(entry);

    expect(output).toContain('"own-binding"');
    expect(output).not.toContain("/node_modules/owndep");
  });

  //? `define` would leak here: Bun applies it to the server modules a macro runs, which then read `/`.
  test("keeps the real __dirname in the modules a macro runs", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, "node_modules/fsdep/package.json"), '{ "name": "fsdep", "main": "index.js" }\n');
    await writeText(path.join(root, "node_modules/fsdep/marker.txt"), "beside-me\n");
    await writeText(
      path.join(root, "node_modules/fsdep/index.js"),
      'const fs = require("node:fs");\nmodule.exports = () => fs.readFileSync(__dirname + "/marker.txt", "utf8").trim();\n',
    );
    await writeText(
      path.join(root, "macro.ts"),
      'import readMarker from "fsdep";\nexport const marker = () => readMarker();\n',
    );
    const entry = path.join(root, "entry.ts");
    await writeText(entry, 'import { marker } from "./macro" with { type: "macro" };\nconsole.info(marker());\n');

    expect(await build(entry)).toContain('"beside-me"');
  });
});
