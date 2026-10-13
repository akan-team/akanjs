import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { BunPlugin, OnLoadResult } from "bun";
import { ServerEnvProfile } from "./serverEnvProfile";

export interface ServerEnvPluginOptions {
  envDir: string;
  /** The environment the image runs: its Dockerfile fixes `AKAN_PUBLIC_ENV` to it. */
  environment: string;
  environments: Iterable<string>;
  /** Bundled in place of the environment's own file: `env.server.<environment>.<profile>.ts`, read from the same folder. */
  profile?: string;
  /** Under a profile, once per lib env file: whether the lib gave one of the profile's, and what was left out if not. */
  onLibEnv?: (file: string, report: { profileFile: boolean; stripped: string[] }) => void;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//* `env.server.ts` imports every environment's file, so an image would hand out the secrets of each environment it
//* never runs. Every file but the image's own is swapped for exports that refuse to be read.
export const createServerEnvPlugin = ({
  envDir,
  environment,
  environments,
  profile,
  onLibEnv,
}: ServerEnvPluginOptions): BunPlugin => {
  const others = [...new Set(environments)].filter((name) => name !== environment);
  //? Bun hands onLoad the real path, which differs from the given one under a symlink (macOS's /var -> /private/var).
  const dirs = new Set([path.resolve(envDir), existsSync(envDir) ? realpathSync.native(envDir) : envDir]);
  const folder = `^(?:${[...dirs].map(escapeRegExp).join("|")})[\\\\/]env\\.server\\.`;
  const filter = new RegExp(`${folder}(?:${others.map(escapeRegExp).join("|")})\\.ts$`);
  const own = new RegExp(`${folder}${escapeRegExp(environment)}\\.ts$`);
  const libEnvs = new Map<string, Promise<OnLoadResult>>();
  const libEnv = async (file: string): Promise<OnLoadResult> => {
    const { loader, contents, profileFile, stripped } = await ServerEnvProfile.libEnvSource(file, profile ?? "");
    onLibEnv?.(file, { profileFile, stripped });
    return { loader, contents };
  };
  return {
    name: "akan-server-env",
    setup(build) {
      //* The environment's own file never enters a profile's bundle: its contents are the profile file's.
      if (profile)
        build.onLoad({ filter: own }, async (args) => ({
          loader: "ts",
          contents: await ServerEnvProfile.sourceInPlaceOf(
            path.join(path.dirname(args.path), ServerEnvProfile.fileName(environment, profile)),
            args.path,
            profile,
          ),
        }));
      if (others.length)
        build.onLoad({ filter }, async (args) => {
          const name = path.basename(args.path, ".ts").slice("env.server.".length);
          const { exports } = new Bun.Transpiler({ loader: "ts" }).scan(await Bun.file(args.path).text());
          const message = `env/env.server.${name}.ts is not in this build: \`akan build\` bundles the server env of AKAN_PUBLIC_ENV=${environment} alone, the environment its image runs. To run ${name}, build for it: AKAN_PUBLIC_ENV=${name} in the workspace's .env, which outranks the shell, or --env ${name} on a desktop or mobile build.`;
          return {
            loader: "js",
            contents: [
              `const refuse = () => { throw new Error(${JSON.stringify(message)}); };`,
              "const unbuilt = new Proxy({}, { get: refuse, has: refuse, ownKeys: refuse, getOwnPropertyDescriptor: refuse });",
              `export { ${exports.map((exported) => `unbuilt as ${JSON.stringify(exported)}`).join(", ")} };`,
            ].join("\n"),
          };
        });
      //? Last: the app's own env files above are taken by the handlers before it, which match them first.
      if (profile)
        build.onLoad({ filter: ServerEnvProfile.envFilePattern }, async (args) => {
          const name = path.basename(args.path, ".ts").slice("env.server.".length);
          if (dirs.has(path.dirname(args.path)) || name === "type" || name === "example")
            return { loader: "ts", contents: await Bun.file(args.path).text() };
          if (!libEnvs.has(args.path)) libEnvs.set(args.path, libEnv(args.path));
          return (await libEnvs.get(args.path)) as OnLoadResult;
        });
    },
  };
};
