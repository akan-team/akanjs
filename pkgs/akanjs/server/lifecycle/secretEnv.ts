import { AkanError } from "../../base/akanError";

export type SecretEnvKind = "string" | "json" | "multiline";

export interface SecretEnvEntry {
  name: string;
  kind: SecretEnvKind;
  /** The developer's own variables the env file reads first (`process.env.MY_URL ?? "…"`): one set stands in. */
  ahead?: string[];
}

interface SecretEnvLogger {
  warn: (message: string) => void;
}

//* `akan build` writes these reads in place of the server env file's secret strings, and names them in AKAN_ENV_NAMES.
export class SecretEnv {
  //? Not named for secrets: Docker's build check flags every ENV whose name says secret, and this one holds names only.
  static readonly listKey = "AKAN_ENV_NAMES";
  //? The database adaptor reads either spelling, so a deployment that sets the other one owes nothing new.
  static readonly #aliases: { readonly [name: string]: readonly string[] } = { POSTGRES_URL: ["POSTGRES_URI"] };

  static #value(name: string, env: NodeJS.ProcessEnv): string | undefined {
    for (const key of [name, ...(SecretEnv.#aliases[name] ?? [])]) if (env[key]) return env[key];
    return undefined;
  }

  static read(name: string): string | undefined {
    return SecretEnv.#value(name, process.env);
  }

  static json(name: string): unknown {
    const text = SecretEnv.#value(name, process.env);
    return text === undefined ? undefined : SecretEnv.#parse(name, text);
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
    return entries
      .map(({ name, kind, ahead = [] }) => `${[name, ...ahead].join("|")}${kind === "string" ? "" : `:${kind}`}`)
      .join(",");
  }

  static parse(list: string | undefined): SecretEnvEntry[] {
    return (list ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [names = "", kind] = entry.split(":");
        const [name = "", ...ahead] = names.split("|");
        return {
          name,
          kind: kind === "json" || kind === "multiline" ? kind : "string",
          ...(ahead.length ? { ahead } : {}),
        };
      });
  }

  static check(logger: SecretEnvLogger, env: NodeJS.ProcessEnv = process.env): void {
    const missing: string[] = [];
    const escaped: string[] = [];
    for (const { name, kind, ahead = [] } of SecretEnv.parse(env[SecretEnv.listKey])) {
      const value = SecretEnv.#value(name, env);
      if (value === undefined) {
        if (!ahead.some((own) => env[own])) missing.push(name);
      } else if (kind === "json") SecretEnv.#parse(name, value);
      else if (kind === "multiline" && value.includes("\\n") && !value.includes("\n")) escaped.push(name);
    }
    if (escaped.length)
      logger.warn(
        `${escaped.join(", ")} ${escaped.length === 1 ? "holds" : "hold"} a backslash and an n where a line should break, as a key pasted onto one line does. Set ${escaped.length === 1 ? "it" : "them"} with real line breaks; \`akan secret-env\` writes ${escaped.length === 1 ? "it" : "them"} so.`,
      );
    if (missing.length) throw new AkanError("secretEnvMissing", SecretEnv.#missingMessage(missing, env));
  }

  static #missingMessage(missing: string[], env: NodeJS.ProcessEnv) {
    const one = missing.length === 1;
    const subject = one
      ? "1 secret env value this server reads from its process env is not set"
      : `${missing.length} secret env values this server reads from its process env are not set`;
    const them = one ? "it" : "them";
    const command = `akan secret-env ${env.AKAN_PUBLIC_APP_NAME || "<app>"} --env ${env.AKAN_PUBLIC_ENV || "<env>"}`;
    return `${subject}, so it does not start: ${missing.join(", ")}. Its build left the ${one ? "value" : "values"} out of the image. Set ${them} in the deployment's environment; \`${command}\` lists every name and writes the values from the env file.`;
  }
}
