#!/usr/bin/env bun
import { type SpawnOptions, spawn } from "node:child_process";
import { delimiter } from "node:path";
import { Command } from "commander";
import { engines } from "./package.json";

type SpawnCommand = typeof spawn;
interface PackageJson {
  version?: string;
}

const spawnProcess = (spawnCommand: SpawnCommand, command: string, args: string[], options: SpawnOptions = {}) => {
  const proc = spawnCommand(command, args, { cwd: process.cwd(), stdio: "inherit", ...options });
  return new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", (code, signal) => {
      if (code || signal) reject({ code, signal });
      else resolve({ code, signal });
    });
  });
};
const readGlobalBinDir = () => {
  const result = Bun.spawnSync(["bun", "pm", "bin", "-g"], { stdout: "pipe", stderr: "ignore" });
  const binDir = result.stdout.toString().trim();
  return result.success && binDir ? binDir : undefined;
};
//? Windows spells the key `Path`, and a spread copy of process.env loses its case-insensitive lookup.
const getPathKey = (env: NodeJS.ProcessEnv) => Object.keys(env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
const isOnPath = (env: NodeJS.ProcessEnv, dir: string) => (env[getPathKey(env)] ?? "").split(delimiter).includes(dir);
const prependToPath = (env: NodeJS.ProcessEnv, dir: string | undefined): NodeJS.ProcessEnv => {
  if (!dir || isOnPath(env, dir)) return env;
  const pathKey = getPathKey(env);
  const current = env[pathKey];
  return { ...env, [pathKey]: current ? `${dir}${delimiter}${current}` : dir };
};

const getPackageVersion = async () => {
  const packageJson = (await Bun.file(new URL("./package.json", import.meta.url)).json()) as PackageJson;
  if (!packageJson.version) throw new Error("create-akan-workspace package version is missing");
  return packageJson.version;
};

interface Options {
  org: string;
  app: string;
  dir: string;
  libs: string | boolean;
  init: string | boolean;
  sample: string | boolean;
  registry?: string;
  owner?: string;
}
const normalizeRegistryUrl = (registryUrl: string) => registryUrl.replace(/\/+$/, "");

export const run = async ({
  argv = process.argv,
  spawnCommand = spawn,
  bunVersion = Bun.version,
  getGlobalBinDir = readGlobalBinDir,
}: {
  argv?: string[];
  spawnCommand?: SpawnCommand;
  bunVersion?: string;
  getGlobalBinDir?: () => string | undefined;
} = {}) => {
  //? A range admits no prerelease of a later release (`1.4.5-canary.1`), so a canary build is judged by its release.
  if (!Bun.semver.satisfies(bunVersion.replace(/-.*$/, ""), engines.bun)) {
    console.error(
      `create-akan-workspace requires Bun ${engines.bun}, but this is Bun ${bunVersion}. Run \`bun upgrade\`, then try again.`,
    );
    process.exitCode = 1;
    return;
  }
  const program = new Command().name("create-akan-workspace");

  program
    .argument("[org]", 'organization name, or "." to create the workspace in --dir itself')
    .option("-a, --app <string>", "application name")
    .option("-d, --dir <string>", 'directory the workspace is created in, as <dir>/<org>, or <dir> itself for "."')
    .option("-l, --libs <boolean>", "install shared and util libraries", false)
    .option("-i, --init <boolean>", "install dependencies and initialize git", true)
    .option("-s, --sample <boolean>", "generate the sample task module, pages and helpers", true)
    .option("-r, --registry <string>", "npm registry URL for installing Akan packages")
    .option("-o, --owner <string>", "owner of the workspace")
    .action(async (org: string | undefined, options: Partial<Options>) => {
      const packageVersion = await getPackageVersion();
      const registry = options.registry ?? process.env.AKAN_NPM_REGISTRY;
      const registryUrl = registry ? normalizeRegistryUrl(registry) : undefined;
      const registryArgs = registryUrl ? ["--registry", registryUrl] : [];
      const env = registryUrl
        ? { ...process.env, AKAN_NPM_REGISTRY: registryUrl, NPM_CONFIG_REGISTRY: registryUrl }
        : process.env;
      const spawnOptions = registryUrl ? { env } : {};
      await spawnProcess(
        spawnCommand,
        "bun",
        ["install", "-g", `@akanjs/cli@${packageVersion}`, ...registryArgs],
        spawnOptions,
      );
      const libs = options.libs === true || options.libs === "true";
      const init = options.init === undefined || options.init === true || options.init === "true";
      const sample = options.sample === undefined || options.sample === true || options.sample === "true";
      //? `bun install -g` links `akan` into Bun's global bin, which is not on PATH when Bun itself came from npm.
      const globalBinDir = getGlobalBinDir();
      await spawnProcess(
        spawnCommand,
        "akan",
        [
          "create-workspace",
          ...(org ? [org] : []),
          ...(options.app ? [`--app=${options.app}`] : []),
          ...(options.dir ? [`--dir=${options.dir}`] : []),
          `--libs=${libs}`,
          `--init=${init}`,
          `--sample=${sample}`,
          ...(registryUrl ? [`--registry=${registryUrl}`] : []),
          ...(options.owner ? [`--owner=${options.owner}`] : []),
        ],
        { env: prependToPath(env, globalBinDir) },
      );
      if (globalBinDir && !isOnPath(process.env, globalBinDir))
        console.warn(
          `\nThe \`akan\` command was installed to ${globalBinDir}, which is not on your PATH. Add that directory to PATH to run \`akan\` from the workspace.`,
        );
    });

  await program.parseAsync(argv);
};
