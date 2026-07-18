#!/usr/bin/env bun
import { type SpawnOptions, spawn } from "node:child_process";
import { Command } from "commander";

type SpawnCommand = typeof spawn;
interface PackageJson {
  version?: string;
}

const spawnProcess = (spawnCommand: SpawnCommand, command: string, args: string[], options: SpawnOptions = {}) => {
  const proc = spawnCommand(command, args, { cwd: process.cwd(), stdio: "inherit", ...options });
  return new Promise((resolve, reject) => {
    proc.on("exit", (code, signal) => {
      if (!!code || signal) reject({ code, signal });
      else resolve({ code, signal });
    });
  });
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
  registry?: string;
  owner?: string;
}
const normalizeRegistryUrl = (registryUrl: string) => registryUrl.replace(/\/+$/, "");

export const run = async ({
  argv = process.argv,
  spawnCommand = spawn,
}: {
  argv?: string[];
  spawnCommand?: SpawnCommand;
} = {}) => {
  const program = new Command().name("create-akan-workspace");

  program
    .argument("[org]", "organization name")
    .option("-a, --app <string>", "application name")
    .option("-d, --dir <string>", "directory")
    .option("-l, --libs <boolean>", "install shared and util libraries", false)
    .option("-i, --init <boolean>", "install dependencies and initialize git", true)
    .option("-r, --registry <string>", "npm registry URL for installing Akan packages")
    .option("-o, --owner <string>", "owner of the workspace")
    .action(async (org: string | undefined, options: Partial<Options>) => {
      const packageVersion = await getPackageVersion();
      const registry = options.registry ?? process.env.AKAN_NPM_REGISTRY;
      const registryUrl = registry ? normalizeRegistryUrl(registry) : undefined;
      const registryArgs = registryUrl ? ["--registry", registryUrl] : [];
      const spawnOptions = registryUrl
        ? { env: { ...process.env, AKAN_NPM_REGISTRY: registryUrl, NPM_CONFIG_REGISTRY: registryUrl } }
        : {};
      await spawnProcess(
        spawnCommand,
        "bun",
        ["install", "-g", `@akanjs/cli@${packageVersion}`, ...registryArgs],
        spawnOptions,
      );
      const libs = options.libs === true || options.libs === "true";
      const init = options.init === undefined || options.init === true || options.init === "true";
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
          ...(registryUrl ? [`--registry=${registryUrl}`] : []),
          ...(options.owner ? [`--owner=${options.owner}`] : []),
        ],
        spawnOptions,
      );
    });

  await program.parseAsync(argv);
};
