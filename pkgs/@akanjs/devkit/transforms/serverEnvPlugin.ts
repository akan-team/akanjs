import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { EnvProfile } from "akanjs/server/lifecycle/envProfile";
import type { BunPlugin, OnLoadResult } from "bun";
import { SecretEnvDeclaration } from "./secretEnvDeclaration";
import { ServerEnvProfile } from "./serverEnvProfile";

export interface ServerEnvPluginOptions {
  envDir: string;
  /** The environment the image runs: its Dockerfile fixes `AKAN_PUBLIC_ENV` to it. */
  environment: string;
  environments: Iterable<string>;
  /** Bundled in place of the environment's own file: `env.server.<environment>.<profile>.ts`, read from the same folder. */
  profile?: string;
  /**
   * Carried beside the environment's own file, or beside `profile` when one is bundled in its place, each as
   * `env.server.<environment>.<profile>.ts`: the server runs the one `AKAN_ENV_PROFILE` names when it starts.
   */
  profiles?: readonly string[];
  /** Under a profile, once per lib env file: whether the lib gave one of the profile's, and what was left out if not. */
  onLibEnv?: (file: string, report: { profile: string; profileFile: boolean; stripped: string[] }) => void;
  /**
   * Without a profile: `read` bundles each env file, a lib's included, with its secret strings replaced by reads of the
   * process env. Unset, the files are bundled as written.
   */
  secrets?: "read";
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ORIGINAL_NAMESPACE = "akan-server-env";
const ORIGINAL_PREFIX = `${ORIGINAL_NAMESPACE}:`;
//? Bun keys a module by its path whatever its namespace, so the file as written needs a path of its own.
const ORIGINAL_SUFFIX = ".original";

//? Only the env the server starts on is evaluated: the environment's own file may not load without its variables.
const selectorOf = (file: string, exports: string[], carried: { [profile: string]: string }, base?: string) => {
  const names = Object.keys(carried);
  const all = [...(base ? [base] : []), ...names];
  const refusal = ` names a server env profile this build does not carry (it carries ${all.join(", ")}).`;
  const named = `process.env.${EnvProfile.key}`;
  return [
    `const profile = ${base ? `${named} === ${JSON.stringify(base)} ? undefined : ${named}` : named};`,
    `const carried = { ${names.map((name) => `${JSON.stringify(name)}: () => ${carried[name]}`).join(", ")} };`,
    `if (profile && !Object.hasOwn(carried, profile)) throw new Error("${EnvProfile.key}=" + profile + ${JSON.stringify(refusal)});`,
    `const picked = profile ? carried[profile]() : require(${JSON.stringify(`${ORIGINAL_PREFIX}${file}`)});`,
    ...exports.map((name) =>
      name === "default" ? "export default picked.default;" : `export const ${name} = picked[${JSON.stringify(name)}];`,
    ),
  ].join("\n");
};

//* `env.server.ts` imports every environment's file, so an image would hand out the secrets of each environment it
//* never runs. Every file but the image's own is swapped for exports that refuse to be read.
export const createServerEnvPlugin = ({
  envDir,
  environment,
  environments,
  profile,
  profiles = [],
  onLibEnv,
  secrets,
}: ServerEnvPluginOptions): BunPlugin => {
  const others = [...new Set(environments)].filter((name) => name !== environment);
  //? Bun hands onLoad the real path, which differs from the given one under a symlink (macOS's /var -> /private/var).
  const dirs = new Set([path.resolve(envDir), existsSync(envDir) ? realpathSync.native(envDir) : envDir]);
  const folder = `^(?:${[...dirs].map(escapeRegExp).join("|")})[\\\\/]env\\.server\\.`;
  const filter = new RegExp(`${folder}(?:${others.map(escapeRegExp).join("|")})\\.ts$`);
  const own = new RegExp(`${folder}${escapeRegExp(environment)}\\.ts$`);
  const carriedNames = profiles.filter((name) => name !== profile);
  const libEnvs = new Map<string, Promise<OnLoadResult>>();
  const libSelectors = new Map<string, Promise<OnLoadResult>>();
  const once = (
    cache: Map<string, Promise<OnLoadResult>>,
    file: string,
    load: (file: string) => Promise<OnLoadResult>,
  ) => {
    if (!cache.has(file)) cache.set(file, load(file));
    return cache.get(file) as Promise<OnLoadResult>;
  };
  const libEnv = async (file: string): Promise<OnLoadResult> => {
    const { loader, contents, profileFile, stripped } = await ServerEnvProfile.libEnvSource(file, profile ?? "");
    onLibEnv?.(file, { profile: profile ?? "", profileFile, stripped });
    return { loader, contents };
  };
  const inPlace = async (file: string, name: string): Promise<OnLoadResult> => ({
    loader: "ts",
    contents: await ServerEnvProfile.sourceInPlaceOf(
      path.join(path.dirname(file), ServerEnvProfile.fileName(environment, name)),
      file,
      name,
    ),
  });
  const exportsOf = async (file: string) =>
    new Bun.Transpiler({ loader: "ts" }).scan(await Bun.file(file).text()).exports;
  const original = async (file: string): Promise<OnLoadResult> =>
    secrets && !profile
      ? await SecretEnvDeclaration.source(file, secrets)
      : { loader: "ts", contents: await Bun.file(file).text() };
  const base = (file: string): Promise<OnLoadResult> => {
    if (!profile) return original(file);
    return own.test(file) ? inPlace(file, profile) : once(libEnvs, file, libEnv);
  };
  const isAppEnv = (file: string) => {
    const name = path.basename(file, ".ts").slice("env.server.".length);
    return dirs.has(path.dirname(file)) || name === "type" || name === "example";
  };
  const ownSelector = async (file: string): Promise<OnLoadResult> => ({
    loader: "js",
    contents: selectorOf(
      file,
      await exportsOf(file),
      Object.fromEntries(
        carriedNames.map((name) => [
          name,
          `require(${JSON.stringify(path.join(path.dirname(file), ServerEnvProfile.fileName(environment, name)))})`,
        ]),
      ),
      profile,
    ),
  });
  const libSelector = async (file: string): Promise<OnLoadResult> => {
    const carried: { [name: string]: string } = {};
    for (const name of carriedNames) {
      const { profileFile, stripped, value } = await ServerEnvProfile.libEnvSource(file, name);
      onLibEnv?.(file, { profile: name, profileFile, stripped });
      carried[name] = profileFile
        ? `require(${JSON.stringify(ServerEnvProfile.profileFileOf(file, name))})`
        : `({ env: ${JSON.stringify(value)} })`;
    }
    return { loader: "js", contents: selectorOf(file, await exportsOf(file), carried, profile) };
  };
  return {
    name: "akan-server-env",
    setup(build) {
      //* The environment's own file never enters a profile's bundle: its contents are the profile file's.
      if (profile && !carriedNames.length) build.onLoad({ filter: own }, (args) => inPlace(args.path, profile));
      if (others.length)
        build.onLoad({ filter }, async (args) => {
          const name = path.basename(args.path, ".ts").slice("env.server.".length);
          const { exports } = new Bun.Transpiler({ loader: "ts" }).scan(await Bun.file(args.path).text());
          const message = `env/env.server.${name}.ts is not in this build: \`akan build\` bundles the server env of AKAN_PUBLIC_ENV=${environment} alone, the environment its image runs. To run ${name}, build for it with \`--env ${name}\` (\`akan build\` or a desktop or mobile build), or AKAN_PUBLIC_ENV=${name} in the shell or the workspace's .env.`;
          return {
            loader: "js",
            contents: [
              `const refuse = () => { throw new Error(${JSON.stringify(message)}); };`,
              "const unbuilt = new Proxy({}, { get: refuse, has: refuse, ownKeys: refuse, getOwnPropertyDescriptor: refuse });",
              `export { ${exports.map((exported) => `unbuilt as ${JSON.stringify(exported)}`).join(", ")} };`,
            ].join("\n"),
          };
        });
      if (carriedNames.length) {
        build.onResolve({ filter: new RegExp(`^${ORIGINAL_PREFIX}`) }, (args) => ({
          path: `${args.path.slice(ORIGINAL_PREFIX.length)}${ORIGINAL_SUFFIX}`,
          namespace: ORIGINAL_NAMESPACE,
        }));
        //? A module under a namespace has no folder of its own to resolve a relative import from.
        build.onResolve({ filter: /^\.{1,2}[\\/]/, namespace: ORIGINAL_NAMESPACE }, (args) => ({
          path: Bun.resolveSync(args.path, path.dirname(args.importer)),
        }));
        build.onLoad({ filter: /.*/, namespace: ORIGINAL_NAMESPACE }, (args) =>
          base(args.path.slice(0, -ORIGINAL_SUFFIX.length)),
        );
        build.onLoad({ filter: own }, (args) => ownSelector(args.path));
        build.onLoad({ filter: ServerEnvProfile.envFilePattern }, (args) => {
          return isAppEnv(args.path) ? original(args.path) : once(libSelectors, args.path, libSelector);
        });
      }
      //? After the stubs, which take the other environments' files first; `env.server.ts` itself is the env file where
      //? a pipeline copies one over the switch.
      if (secrets && !profile)
        build.onLoad({ filter: ServerEnvProfile.envModulePattern }, (args) =>
          SecretEnvDeclaration.source(args.path, secrets),
        );
      //? Last: the app's own env files above are taken by the handlers before it, which match them first.
      if (profile && !carriedNames.length)
        build.onLoad({ filter: ServerEnvProfile.envFilePattern }, (args) =>
          isAppEnv(args.path) ? original(args.path) : once(libEnvs, args.path, libEnv),
        );
    },
  };
};
