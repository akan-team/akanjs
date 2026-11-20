import path from "node:path";
import { FileSys } from "../util/fileSys";
import { MainCheckout } from "./mainCheckout";

export interface EnvSeedFile {
  fileName: string;
  content: string;
  /** The main checkout's file the content is a copy of, when the folder is in a linked worktree that has none. */
  copiedFrom?: string;
}

//? These files are gitignored for the secrets they hold, so a fresh clone has none of them.
export class EnvSeed {
  static readonly #server = `import type { ModulesOptions } from "../lib/option";

export const env: ModulesOptions = {};
`;
  static readonly #testingServer = `import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
};
`;
  static readonly #client = `import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {};
`;
  static readonly #untypedClient = "export const env = {};\n";
  static readonly #selectors = ["env.server.ts", "env.client.ts"];
  //? `type` is generated and `example` tracked; a dotted name (`debug.desktop`) is a build profile no selector imports.
  static readonly #selectedPattern = /^\.\/(env\.(?:server|client)\.(?!(?:type|example)$)[\w-]+)$/;
  //? A lib's server.ts and the signal test runtime import it by name, whatever the selector imports.
  static readonly #testing = "env.server.testing.ts";

  readonly #envDir: string;
  constructor(envDir: string) {
    this.#envDir = envDir;
  }

  async missing(): Promise<EnvSeedFile[]> {
    const wanted = [...new Set([EnvSeed.#testing, ...(await this.#selected())])].sort();
    const exists = await Promise.all(wanted.map((fileName) => FileSys.fileExists(path.join(this.#envDir, fileName))));
    const missing = wanted.filter((_, idx) => !exists[idx]);
    return await Promise.all(missing.map(async (fileName) => await this.#seedOf(fileName)));
  }

  //? Copied, not linked: a symlinked env file resolves its `../lib/option` import from the main checkout's tree.
  async #seedOf(fileName: string): Promise<EnvSeedFile> {
    const copiedFrom = await MainCheckout.counterpartOf(path.join(this.#envDir, fileName));
    if (copiedFrom) return { fileName, content: await FileSys.readText(copiedFrom), copiedFrom };
    return { fileName, content: await this.#contentOf(fileName) };
  }

  static notices(seeded: EnvSeedFile[]): string[] {
    const named = (files: EnvSeedFile[]) => files.map(({ fileName }) => `env/${fileName}`).join(", ");
    const copied = seeded.filter((file) => file.copiedFrom !== undefined);
    const defaults = seeded.filter((file) => file.copiedFrom === undefined);
    const source = copied.map(({ copiedFrom }) => copiedFrom).find((file) => file !== undefined);
    return [
      ...(source
        ? [
            `${named(copied)} were missing in this worktree (gitignored, so a worktree has none) and now hold a copy of the main checkout's, from ${path.dirname(source)}: a later change there does not reach the copy.`,
          ]
        : []),
      ...(defaults.length
        ? [
            `${named(defaults)} were missing (gitignored, so a clone has none) and now hold local defaults: put this machine's values in them, or fetch the team's with \`akan download-env\`.`,
          ]
        : []),
    ];
  }

  async #selected() {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    const selected = await Promise.all(
      EnvSeed.#selectors.map(async (selector) => {
        const file = path.join(this.#envDir, selector);
        if (!(await FileSys.fileExists(file))) return [];
        return transpiler
          .scan(await FileSys.readText(file))
          .imports.flatMap(({ path: specifier }) => specifier.match(EnvSeed.#selectedPattern)?.[1] ?? [])
          .map((name) => `${name}.ts`);
      }),
    );
    return selected.flat();
  }

  async #contentOf(fileName: string) {
    const side = fileName.startsWith("env.client.") ? "client" : "server";
    const example = path.join(this.#envDir, `env.${side}.example.ts`);
    if (await FileSys.fileExists(example)) return await FileSys.readText(example);
    if (side === "server") return fileName === EnvSeed.#testing ? EnvSeed.#testingServer : EnvSeed.#server;
    const typed = await FileSys.fileExists(path.join(this.#envDir, "env.client.type.ts"));
    return typed ? EnvSeed.#client : EnvSeed.#untypedClient;
  }
}
