import { existsSync } from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { SecretEnvEntry, SecretEnvKind } from "akanjs/server/lifecycle/secretEnv";
import { SecretEnvName } from "./secretEnvName";
import { type SecretEnvMode, SecretEnvSource } from "./secretEnvSource";
import { ServerEnvEvaluationError } from "./serverEnvEvaluationError";
import { type EnvEvaluated, ServerEnvProfile, type ServerEnvSource } from "./serverEnvProfile";

export interface SecretEnvVariable extends SecretEnvEntry {
  path: string;
  value: string;
}

export interface SecretEnvHeld {
  path: string;
  value: string;
}

interface Variables {
  readonly [name: string]: string;
}

interface Loaded extends EnvEvaluated {
  variables: Variables;
}

interface Computed {
  at: string;
  segments: string[];
  value: string;
}

interface Found {
  variables: SecretEnvVariable[];
  computed: Computed[];
}

export interface SecretEnvDeclared {
  variables: SecretEnvVariable[];
  /** Keys whose secret value the env computes or imports, so no build can read it from a variable. A value that comes from the env file's own read of the process env is not one. */
  unmoved: string[];
  /** The values of `unmoved` long enough to look for in the files a build wrote. */
  held: SecretEnvHeld[];
}

//* Evaluated with each secret literal marked as a build replaces it, so the list is the reads the built server holds.
export class SecretEnvDeclaration {
  //? Lowercase letters and digits, which `encodeURIComponent` and a URL's parts keep as they are.
  static readonly #unset = "akanownenvunset7q3x9";
  static readonly #set = "akanownenvset5k8w2";

  static async of(envDir: string, environment: string): Promise<SecretEnvDeclared> {
    const file = path.join(envDir, "env.server.ts");
    if (!existsSync(file))
      throw new Error(`${file} is missing: \`akan sync\` writes the app's env files where it has none.`);
    const loaded = await SecretEnvDeclaration.#loaded(file, envDir, environment);
    const found: Found = { variables: [], computed: [] };
    SecretEnvDeclaration.#collect(loaded.value, "", [], false, found);
    const variables = new Map<string, SecretEnvVariable>();
    for (const variable of found.variables) {
      const taken = variables.get(variable.name);
      if (taken && taken.path !== variable.path)
        throw new Error(
          `${file} holds \`${taken.path}\` and \`${variable.path}\`, secrets a build would both read from the environment variable ${variable.name}. Rename one of the keys.`,
        );
      variables.set(variable.name, variable);
    }
    const computed = await SecretEnvDeclaration.#notRead(found.computed, file, envDir, environment, loaded);
    const unmoved = [...new Set(computed.map(({ at }) => at))];
    const held = ServerEnvProfile.secretValues(SecretEnvDeclaration.#withoutMarks(loaded.value)).filter((secret) =>
      unmoved.some((at) => secret.path === at || secret.path.startsWith(`${at}.`)),
    );
    return { variables: [...variables.values()], unmoved, held };
  }

  static async #evaluate(file: string, envDir: string, environment: string, variables: Variables) {
    return await ServerEnvProfile.evaluateReads(
      file,
      path.dirname(envDir),
      (envFile) => SecretEnvDeclaration.source(envFile, "mark"),
      { environment, loads: ServerEnvProfile.envModulePattern, variables },
    );
  }

  //* With no variable of the shell first, so the list is the same from any shell and a value is what the bundle
  //* carries with none set. An env file that cannot load so (`process.env.HOSTS!.split(",")`) loads with the shell's.
  static async #loaded(file: string, envDir: string, environment: string): Promise<Loaded> {
    try {
      return { ...(await SecretEnvDeclaration.#evaluate(file, envDir, environment, {})), variables: {} };
    } catch (error) {
      if (!(error instanceof ServerEnvEvaluationError) || error.reason === "timedOut") throw error;
    }
    const variables = Object.fromEntries(
      Object.entries(process.env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])),
    );
    return { ...(await SecretEnvDeclaration.#evaluate(file, envDir, environment, variables)), variables };
  }

  //* Leaves out what the env file reads from the process env itself, which the bundle holds as a read: a value a
  //* variable of the shell gave, and one that changes with a variable the file asked for.
  static async #notRead(computed: Computed[], file: string, envDir: string, environment: string, loaded: Loaded) {
    const given = Object.values(loaded.variables).filter((value) => value !== "");
    const kept = computed.filter(
      ({ value }) => !given.some((own) => own === value || (own.length >= 8 && value.includes(own))),
    );
    if (!kept.length) return kept;
    const names = loaded.reads.filter((name) => SecretEnvName.refusal(name) === null);
    if (!names.length) return kept;
    const probing = {
      ...loaded.variables,
      ...Object.fromEntries(
        names.map((name) => [
          name,
          Object.hasOwn(loaded.variables, name)
            ? `${loaded.variables[name]}${SecretEnvDeclaration.#set}`
            : SecretEnvDeclaration.#unset,
        ]),
      ),
    };
    const probed = await SecretEnvDeclaration.#evaluate(file, envDir, environment, probing).then(
      ({ value }) => value,
      (error: unknown) => {
        if (error instanceof ServerEnvEvaluationError) return undefined;
        throw error;
      },
    );
    return kept.filter(
      ({ segments, value }) =>
        !SecretEnvDeclaration.#followsRead(
          value,
          segments.reduce<unknown>(
            (node, key) => (node as { [key: string]: unknown } | null | undefined)?.[key],
            probed,
          ),
        ),
    );
  }

  //* `"Bearer " + process.env.TOKEN` reads "Bearer undefined" with the variable unset and holds the probe with it set.
  static #followsRead(value: string, probed: unknown) {
    if (typeof probed !== "string") return false;
    const lower = probed.toLowerCase();
    if (!lower.includes(SecretEnvDeclaration.#set) && !lower.includes(SecretEnvDeclaration.#unset)) return false;
    const given = probed.replace(new RegExp(SecretEnvDeclaration.#set, "gi"), "");
    const unset = new RegExp(SecretEnvDeclaration.#unset, "gi");
    return ["undefined", "", "null"].some((gone) => given.replace(unset, gone) === value);
  }

  static #withoutMarks(value: unknown): unknown {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((item) => SecretEnvDeclaration.#withoutMarks(item));
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) =>
        Array.isArray((child as { [key: string]: unknown } | null)?.[SecretEnvSource.markKey])
          ? []
          : [[key, SecretEnvDeclaration.#withoutMarks(child)]],
      ),
    );
  }

  static async source(file: string, mode: SecretEnvMode): Promise<ServerEnvSource> {
    const contents = await Bun.file(file).text();
    const name = path.basename(file, ".ts").slice("env.server.".length);
    if (name === "type" || name === "example") return { loader: "ts", contents };
    return { loader: "ts", contents: SecretEnvSource.rewrite(file, contents, mode) };
  }

  static #collect(value: unknown, at: string, segments: string[], underSecret: boolean, found: Found): void {
    if (typeof value === "string") {
      if (ServerEnvProfile.isSecret(value, underSecret)) found.computed.push({ at, segments, value });
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries())
        SecretEnvDeclaration.#collect(item, at, [...segments, String(index)], underSecret, found);
      return;
    }
    const mark = (value as { [key: string]: unknown })[SecretEnvSource.markKey];
    if (Array.isArray(mark)) {
      const [name, kind, held] = mark as [string, SecretEnvKind, unknown];
      found.variables.push({ name, kind, path: at, value: typeof held === "string" ? held : JSON.stringify(held) });
      return;
    }
    for (const [key, child] of Object.entries(value))
      SecretEnvDeclaration.#collect(
        child,
        at ? `${at}.${key}` : key,
        [...segments, key],
        underSecret || Logger.isSecretKey(key),
        found,
      );
  }
}
