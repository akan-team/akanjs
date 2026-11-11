import path from "node:path";
import { FileSys } from "../util/fileSys";

export interface EnvSeedFile {
  fileName: string;
  content: string;
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
    return await Promise.all(missing.map(async (fileName) => ({ fileName, content: await this.#contentOf(fileName) })));
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
