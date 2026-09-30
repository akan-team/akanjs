import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import type { BunPlugin } from "bun";

export interface ServerEnvPluginOptions {
  envDir: string;
  /** The environment the image runs: its Dockerfile fixes `AKAN_PUBLIC_ENV` to it. */
  environment: string;
  environments: Iterable<string>;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//* `env.server.ts` imports every environment's file, so an image would hand out the secrets of each environment it
//* never runs. Every file but the image's own is swapped for exports that refuse to be read.
export const createServerEnvPlugin = ({ envDir, environment, environments }: ServerEnvPluginOptions): BunPlugin => {
  const others = [...new Set(environments)].filter((name) => name !== environment);
  //? Bun hands onLoad the real path, which differs from the given one under a symlink (macOS's /var -> /private/var).
  const dirs = new Set([path.resolve(envDir), existsSync(envDir) ? realpathSync.native(envDir) : envDir]);
  const names = others.map(escapeRegExp).join("|");
  const filter = new RegExp(`^(?:${[...dirs].map(escapeRegExp).join("|")})[\\\\/]env\\.server\\.(?:${names})\\.ts$`);
  return {
    name: "akan-server-env",
    setup(build) {
      if (!others.length) return;
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
    },
  };
};
