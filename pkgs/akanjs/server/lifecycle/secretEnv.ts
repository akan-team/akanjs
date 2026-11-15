import { AkanError } from "../../base/akanError";

export type SecretEnvKind = "string" | "json" | "multiline";

export interface SecretEnvEntry {
  name: string;
  kind: SecretEnvKind;
}

export interface SecretEnvReport {
  missing: string[];
  escaped: string[];
}

interface SecretEnvLogger {
  warn: (message: string) => void;
}

//* `akan build` writes these reads in place of the server env file's secret strings, and names them in AKAN_ENV_NAMES.
export class SecretEnv {
  //? Not named for secrets: Docker's build check flags every ENV whose name says secret, and this one holds names only.
  static readonly listKey = "AKAN_ENV_NAMES";
  //* `image` when `akan build --inline-secrets` kept the values in the build, which a variable left unset falls back to.
  static readonly fallbackKey = "AKAN_ENV_FALLBACK";
  //? The database adaptor reads either spelling, so a deployment that sets the other one owes nothing new.
  static readonly #aliases: { readonly [name: string]: readonly string[] } = { POSTGRES_URL: ["POSTGRES_URI"] };

  static #value(name: string, env: NodeJS.ProcessEnv): string | undefined {
    for (const key of [name, ...(SecretEnv.#aliases[name] ?? [])]) if (env[key]) return env[key];
    return undefined;
  }

  static read(name: string, inlined?: string): string | undefined {
    return SecretEnv.#value(name, process.env) ?? inlined;
  }

  static json(name: string, inlined?: unknown): unknown {
    const text = SecretEnv.#value(name, process.env);
    return text === undefined ? inlined : SecretEnv.#parse(name, text);
  }

  //? No `cause`: the parser's own message quotes the text it stopped at, which is part of the secret.
  static #parse(name: string, text: string): unknown[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (Array.isArray(parsed)) return parsed;
    throw new AkanError(
      "secretEnvInvalid",
      `${name} must hold a JSON array, as \`akan secret-env\` writes it, and what it holds is not one.`,
    );
  }

  static format(entries: readonly SecretEnvEntry[]): string {
    return entries.map(({ name, kind }) => (kind === "string" ? name : `${name}:${kind}`)).join(",");
  }

  static parse(list: string | undefined): SecretEnvEntry[] {
    return (list ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name = "", kind] = entry.split(":");
        return { name, kind: kind === "json" || kind === "multiline" ? kind : "string" };
      });
  }

  static check(logger: SecretEnvLogger, env: NodeJS.ProcessEnv = process.env): SecretEnvReport {
    const missing: string[] = [];
    const escaped: string[] = [];
    for (const { name, kind } of SecretEnv.parse(env[SecretEnv.listKey])) {
      const value = SecretEnv.#value(name, env);
      if (value === undefined) missing.push(name);
      else if (kind === "json") SecretEnv.#parse(name, value);
      else if (kind === "multiline" && value.includes("\\n") && !value.includes("\n")) escaped.push(name);
    }
    if (escaped.length)
      logger.warn(
        `${escaped.join(", ")} ${escaped.length === 1 ? "holds" : "hold"} a backslash and an n where a line should break, as a key pasted onto one line does. Set ${escaped.length === 1 ? "it" : "them"} with real line breaks; \`akan secret-env\` writes ${escaped.length === 1 ? "it" : "them"} so.`,
      );
    if (missing.length) logger.warn(SecretEnv.#missingMessage(missing, env));
    return { missing, escaped };
  }

  static #missingMessage(missing: string[], env: NodeJS.ProcessEnv) {
    const one = missing.length === 1;
    const subject = one
      ? "1 secret env value this server declares is not set"
      : `${missing.length} secret env values this server declares are not set`;
    const them = one ? "it" : "them";
    if (env[SecretEnv.fallbackKey] === "image")
      return `${subject}, so it uses the ${one ? "value" : "values"} built into this image (akan build --inline-secrets): ${missing.join(", ")}. Set ${them} in the deployment's environment and build without the flag; akanjs 3.5.0 removes it.`;
    const command = `akan secret-env ${env.AKAN_PUBLIC_APP_NAME || "<app>"} --env ${env.AKAN_PUBLIC_ENV || "<env>"}`;
    return `${subject}: ${missing.join(", ")}. The framework does not stop for ${them} yet, though whatever reads ${them} may, and akanjs 3.5.0 will refuse to boot. Set ${them} in the deployment's environment; \`${command}\` lists every name.`;
  }
}
