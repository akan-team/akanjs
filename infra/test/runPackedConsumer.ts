import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Typechecks a workspace that installed the packed akanjs and @akanjs/devkit, as a published consumer sees them: outside
 * this monorepo, where no workspace link or tsconfig `paths` entry stands in for a package no registry carries.
 *
 *   bun run release:build-packages && bun run release:typecheck-consumer
 */
class PackedConsumer {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #packages = ["akanjs", "@akanjs/devkit"] as const;
  //? devkit ships its source, so the consumer's tsc checks every devkit file these facets reach.
  static readonly #imports = ["@akanjs/devkit/akanConfig", "@akanjs/devkit/mobile", "@akanjs/devkit/pipeline"] as const;

  async run() {
    const dir = await mkdtemp(path.join(tmpdir(), "akan-packed-consumer-"));
    try {
      const tarballs = await this.#pack(path.join(dir, "tgz"));
      await this.#writeConsumer(dir, tarballs);
      if (!(await PackedConsumer.#spawn("install", ["bun", "install"], dir))) return 1;
      const tsc = path.join(dir, "node_modules", ".bin", "tsc");
      return (await PackedConsumer.#spawn("tsc", [tsc, "--noEmit", "-p", dir], dir)) ? 0 : 1;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async #pack(destination: string) {
    const tarballs: Record<string, string> = {};
    await mkdir(destination, { recursive: true });
    for (const name of PackedConsumer.#packages) {
      const distDir = path.join(PackedConsumer.#root, "dist", "pkgs", name);
      if (!(await Bun.file(path.join(distDir, "package.json")).exists()))
        throw new Error(`${distDir} is not built; run \`bun run release:build-packages\` first.`);
      const tarball = path.join(destination, `${name.replace("@", "").replace("/", "-")}.tgz`);
      const packed = await PackedConsumer.#spawn(
        `pack ${name}`,
        ["bun", "pm", "pack", "--quiet", "--filename", tarball],
        distDir,
      );
      if (!packed) throw new Error(`bun pm pack failed for ${name}`);
      tarballs[name] = `file:${tarball}`;
    }
    return tarballs;
  }

  async #writeConsumer(dir: string, tarballs: Record<string, string>) {
    const rootPackageJson = (await Bun.file(path.join(PackedConsumer.#root, "package.json")).json()) as {
      devDependencies: Record<string, string>;
    };
    const devDependencies = Object.fromEntries(
      ["typescript", "@types/bun"].map((name) => [name, rootPackageJson.devDependencies[name]]),
    );
    await Bun.write(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: "packed-consumer",
        private: true,
        type: "module",
        dependencies: tarballs,
        overrides: tarballs,
        devDependencies,
      }),
    );
    const template = path.join(PackedConsumer.#root, "pkgs/@akanjs/cli/templates/workspaceRoot/tsconfig.json.template");
    const tsconfig = (await Bun.file(template).json()) as { compilerOptions: Record<string, unknown> };
    delete tsconfig.compilerOptions.paths;
    await Bun.write(path.join(dir, "tsconfig.json"), JSON.stringify({ ...tsconfig, include: ["index.ts"] }));
    const source = PackedConsumer.#imports.map((specifier, idx) => `import type * as m${idx} from "${specifier}";\n`);
    await Bun.write(path.join(dir, "index.ts"), source.join(""));
  }

  static async #spawn(name: string, command: string[], cwd: string) {
    console.info(`[packed-consumer] ${name}`);
    const proc = Bun.spawn(command, { cwd, stdio: ["ignore", "inherit", "inherit"] });
    const passed = (await proc.exited) === 0;
    if (!passed) console.info(`[packed-consumer] FAILED ${name}`);
    return passed;
  }
}

process.exit(await new PackedConsumer().run());
