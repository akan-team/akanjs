import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";

const makeTempRoot = tempDirs("akan-csr-artifact-");

describe("CsrArtifactBuilder.bundleOptions", () => {
  //? A child process: Bun reads `.env` only at start, and the bug was that this snapshot outranked `define`.
  test("bakes the env a native build sets on process.env, not the .env value Bun loaded at start", async () => {
    const root = await makeTempRoot();
    await writeText(path.join(root, ".env"), "AKAN_PUBLIC_ENV=local\n");
    await writeText(path.join(root, "entry.ts"), 'console.info("envmark:" + process.env.AKAN_PUBLIC_ENV);\n');
    await writeText(
      path.join(root, "build.ts"),
      `import { CsrArtifactBuilder } from ${JSON.stringify(path.join(import.meta.dir, "csrArtifactBuilder.ts"))};
process.env.AKAN_PUBLIC_ENV = "debug";
const app = { getPublicEnv: () => ({ AKAN_PUBLIC_ENV: process.env.AKAN_PUBLIC_ENV }) };
const result = await Bun.build({ ...CsrArtifactBuilder.bundleOptions(app as never, "build"), entrypoints: ["./entry.ts"] });
console.info(await result.outputs[0].text());
`,
    );
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("AKAN_PUBLIC_")));
    const proc = Bun.spawn([process.execPath, "build.ts"], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("envmark:debug");
    expect(stdout).not.toContain("envmark:local");
  });

  //? An OTA release is keyed on the bundle's hash, so a no-op build from another checkout must not stage one.
  test("bundles the same app identically from two checkout paths", async () => {
    const app = { getPublicEnv: () => ({ AKAN_PUBLIC_ENV: "main" }) };
    const buildFrom = async (root: string) => {
      await writeText(
        path.join(root, "node_modules/wasmdep/package.json"),
        '{ "name": "wasmdep", "main": "index.js" }\n',
      );
      await writeText(
        path.join(root, "node_modules/wasmdep/index.js"),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture module's own source holds a template literal
        'var isNode = typeof process == "object" && !!process.versions?.node;\nmodule.exports = isNode ? `${__dirname}/` : "";\n',
      );
      await writeText(path.join(root, "entry.ts"), 'import dir from "wasmdep";\nconsole.info(dir);\n');
      const result = await Bun.build({
        ...CsrArtifactBuilder.bundleOptions(app as never, "build"),
        entrypoints: [path.join(root, "entry.ts")],
      });
      expect(result.success).toBe(true);
      return await result.outputs[0]?.text();
    };
    const [first, second] = [await makeTempRoot(), await makeTempRoot()];

    const [firstOutput, secondOutput] = [await buildFrom(first), await buildFrom(second)];

    expect(firstOutput).toBe(secondOutput);
    expect(firstOutput).not.toContain(path.basename(first));
  });

  //? The shape of `@lexical/code-prism` under a `lazy()` editor, which threw in every view and CSR shell carrying it.
  test("runs a lazily imported module's CommonJS side-effect import before the imports after it", async () => {
    const root = await makeTempRoot();
    const app = { getPublicEnv: () => ({ AKAN_PUBLIC_ENV: "main" }) };
    await writeText(path.join(root, "node_modules/core/package.json"), '{ "name": "core", "main": "index.js" }\n');
    await writeText(
      path.join(root, "node_modules/core/index.js"),
      "var Core = { langs: [] };\nglobalThis.Core = Core;\nmodule.exports = Core;\n",
    );
    await writeText(path.join(root, "node_modules/core/components/a.js"), 'Core.langs.push("a");\n');
    await writeText(
      path.join(root, "node_modules/highlight/package.json"),
      '{ "name": "highlight", "type": "module", "main": "index.js" }\n',
    );
    await writeText(
      path.join(root, "node_modules/highlight/index.js"),
      'import "core";\nimport "core/components/a.js";\nexport const langs = () => globalThis.Core.langs;\n',
    );
    await writeText(
      path.join(root, "entry.ts"),
      'import("highlight").then(({ langs }) => console.info(langs().join()));\n',
    );
    const result = await Bun.build({
      ...CsrArtifactBuilder.bundleOptions(app as never, "build"),
      entrypoints: [path.join(root, "entry.ts")],
    });
    expect(result.success).toBe(true);
    await Bun.write(path.join(root, "out.js"), (await result.outputs[0]?.text()) ?? "");

    const proc = Bun.spawn([process.execPath, "out.js"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(stderr).toBe("");
    expect(stdout.trim()).toBe("a");
  });
});
