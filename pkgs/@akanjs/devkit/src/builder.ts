import * as esbuild from "esbuild";
import { dtsPlugin } from "esbuild-plugin-d.ts";
import fs from "fs";

import { Executor } from "./executors";
import { extractDependencies } from "./extractDeps";
import { PackageJson } from "./types";

const assetExtensions = [".css", ".md", ".js", ".png", ".ico", ".svg", ".json", ".template"];
const assetLoader = Object.fromEntries(assetExtensions.map((ext) => [ext, "copy" as const]));

interface BuildOptions {
  bundle?: boolean;
  additionalEntryPoints?: string[];
}

interface BuilderOptions {
  executor: Executor;
  distExecutor: Executor;
  pkgJson: PackageJson;
  rootPackageJson: PackageJson;
}
export class Builder {
  #executor: Executor;
  #distExecutor: Executor;
  #pkgJson: PackageJson;
  #rootPackageJson: PackageJson;

  constructor({ executor, distExecutor, pkgJson, rootPackageJson }: BuilderOptions) {
    this.#executor = executor;
    this.#distExecutor = distExecutor;
    this.#pkgJson = pkgJson;
    this.#rootPackageJson = rootPackageJson;
  }
  #getBuildOptions(
    format: "cjs" | "esm",
    { bundle = false, additionalEntryPoints = [] }: { bundle?: boolean; additionalEntryPoints?: string[] } = {}
  ): esbuild.BuildOptions {
    return {
      entryPoints: [
        ...(bundle
          ? [`${this.#executor.cwdPath}/index.ts`]
          : [`${this.#executor.cwdPath}/**/*.ts`, `${this.#executor.cwdPath}/**/*.tsx`]),
        ...additionalEntryPoints,
      ],
      bundle,
      packages: "external",
      splitting: false,
      platform: this.#pkgJson.esbuild?.platform,
      format,
      outdir: `${this.#distExecutor.cwdPath}/${format}`,
      logLevel: "error",
      // external: ["react", "react-dom"],
      loader: assetLoader,
    };
  }
  #getAssetBuildOptions(): esbuild.BuildOptions {
    return {
      write: true,
      bundle: false,
      entryPoints: [
        `${this.#executor.cwdPath}/**/*.css`,
        `${this.#executor.cwdPath}/**/*.md`,
        `${this.#executor.cwdPath}/**/*.js`,
      ],
      outdir: this.#distExecutor.cwdPath,
      logLevel: "error",
      loader: assetLoader,
    };
  }
  async build(options: BuildOptions = {}) {
    if (fs.existsSync(this.#distExecutor.cwdPath))
      await this.#distExecutor.exec(`rm -rf ${this.#distExecutor.cwdPath}`);
    const plugins = [dtsPlugin({ tsconfig: `${this.#executor.cwdPath}/tsconfig.json` })];
    const [buildResult] = await Promise.all([
      esbuild.build({ ...this.#getBuildOptions("cjs", options), write: false, plugins }),
      esbuild.build({ write: true, ...this.#getBuildOptions("esm", options) }),
      esbuild.build({ ...this.#getAssetBuildOptions() }),
    ]);

    // 3. generate package.json
    const existingDeps = Object.keys(this.#pkgJson.dependencies ?? {});
    const dependencies = extractDependencies(buildResult.outputFiles, this.#rootPackageJson, existingDeps);

    const pkgPackageJson: PackageJson = {
      ...this.#pkgJson,
      main: "./index.js",
      engines: { node: ">=20" },
      dependencies,
      exports: {
        ...(this.#pkgJson.exports ?? {}),
        ".": {
          require: "./cjs/index.js",
          import: "./esm/index.js",
          types: "./index.d.ts",
        },
      },
    };
    buildResult.outputFiles.map((file) => this.#distExecutor.writeFile(file.path, file.text));
    this.#distExecutor.setPackageJson(pkgPackageJson);
    this.#executor.setPackageJson(pkgPackageJson);
  }
}
