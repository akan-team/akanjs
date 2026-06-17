import path from "node:path";
import { $ } from "bun";

const CLI_DIR = import.meta.dir;
const PACKAGE_DIR = CLI_DIR;
const DEVKIT_DIR = path.resolve(CLI_DIR, "../devkit");
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? process.cwd();
const OUT_DIR = process.env.DIST_DIR ?? `${WORKSPACE_ROOT}/dist/pkgs/@akanjs/cli`;

const build = async () => {
  try {
    const packageJson = await Bun.file(`${PACKAGE_DIR}/package.json`).json();
    await $`rm -rf ${OUT_DIR}`;
    const buildResult = await Bun.build({
      entrypoints: [
        `${CLI_DIR}/index.ts`,
        `${DEVKIT_DIR}/incrementalBuilder/incrementalBuilder.proc.ts`,
        `${DEVKIT_DIR}/typecheck/typecheck.proc.ts`,
      ],
      splitting: false,
      target: "bun",
      outdir: OUT_DIR,
      naming: { entry: "[name].js" },
      external: Object.keys({ ...packageJson.dependencies, ...packageJson.peerDependencies }).filter(
        (name) => name !== "@akanjs/devkit",
      ),
      plugins: [],
    });
    if (!buildResult.success) throw new AggregateError(buildResult.logs, "CLI build failed");
    await $`rm -rf ${OUT_DIR}/templates ${OUT_DIR}/guidelines`;
    await $`cp -R ${CLI_DIR}/templates ${OUT_DIR}/templates`;
    await $`cp -R ${CLI_DIR}/guidelines ${OUT_DIR}/guidelines`;
    const distPackageJson = {
      ...packageJson,
      bin: { akan: "./index.js", akan2: "./index.js" },
      exports: {
        ".": { import: "./index.js", default: "./index.js" },
        "./package.json": "./package.json",
      },
    };
    await Bun.write(`${OUT_DIR}/package.json`, JSON.stringify(distPackageJson, null, 2));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

build();
