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

interface MarkedVariable extends SecretEnvVariable {
  literal: unknown;
  underSecret: boolean;
}

interface Found {
  variables: MarkedVariable[];
  computed: Computed[];
  plain: { at: string; value: string }[];
}

export interface SecretEnvMoved {
  path: string;
  name: string;
  /** One secret string the variable holds: the value, an item of its array, or the password of a URL in it. */
  value: string;
  /** Keys of the env that hold the same string and stay in the build as written. */
  twins: string[];
}

export interface SecretEnvDeclared {
  variables: SecretEnvVariable[];
  /** Keys whose secret value the env computes or imports, and does not read from the process env itself. */
  unmoved: string[];
  moved: SecretEnvMoved[];
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
    const found: Found = { variables: [], computed: [], plain: [] };
    SecretEnvDeclaration.#collect(loaded.value, "", [], false, found);
    const variables = new Map<string, MarkedVariable>();
    for (const variable of found.variables) {
      const taken = variables.get(variable.name);
      if (taken && taken.path !== variable.path)
        throw new Error(
          `${file} holds \`${taken.path}\` and \`${variable.path}\`, secrets a build would both read from the environment variable ${variable.name}. Rename one of the keys.`,
        );
      variables.set(variable.name, variable);
    }
    const computed = await SecretEnvDeclaration.#notRead(found.computed, file, envDir, environment, loaded);
    return {
      variables: [...variables.values()].map(({ name, kind, path: at, value, ahead }) => ({
        name,
        kind,
        path: at,
        value,
        ...(ahead ? { ahead } : {}),
      })),
      unmoved: [...new Set(computed.map(({ at }) => at))],
      moved: [...variables.values()].flatMap(({ name, path: at, literal, underSecret }) =>
        ServerEnvProfile.movedTexts(literal, underSecret).map((value) => ({
          path: at,
          name,
          value,
          twins: [
            ...new Set(
              found.plain
                .filter((plain) => plain.value === value || (value.length >= 8 && plain.value.includes(value)))
                .map((plain) => plain.at),
            ),
          ],
        })),
      ),
    };
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
    const probe = async (probed: string[]) =>
      await SecretEnvDeclaration.#evaluate(file, envDir, environment, {
        ...loaded.variables,
        ...Object.fromEntries(
          probed.map((name) => [
            name,
            Object.hasOwn(loaded.variables, name)
              ? `${loaded.variables[name]}${SecretEnvDeclaration.#set}`
              : SecretEnvDeclaration.#unset,
          ]),
        ),
      }).then(
        ({ value }) => [value],
        (error: unknown) => {
          if (error instanceof ServerEnvEvaluationError) return [];
          throw error;
        },
      );
    //? All names at once, and one at a time when that cannot load: `new URL(process.env.BASE ?? "…")` throws on a probe.
    const all = names.length ? await probe(names) : [];
    const probes = all.length ? all : (await Promise.all(names.slice(0, 32).map((name) => probe([name])))).flat();
    return kept.filter(
      ({ segments, value }) =>
        !probes.some((probed) =>
          SecretEnvDeclaration.#followsRead(
            value,
            segments.reduce<unknown>(
              (node, key) => (node as { [key: string]: unknown } | null | undefined)?.[key],
              probed,
            ),
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

  static async source(file: string, mode: SecretEnvMode): Promise<ServerEnvSource> {
    const contents = await Bun.file(file).text();
    const name = path.basename(file, ".ts").slice("env.server.".length);
    if (name === "type" || name === "example") return { loader: "ts", contents };
    return { loader: "ts", contents: SecretEnvSource.rewrite(file, contents, mode) };
  }

  static #collect(value: unknown, at: string, segments: string[], underSecret: boolean, found: Found): void {
    if (typeof value === "string") {
      found.plain.push({ at, value });
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
      const [name, kind, literal, ahead] = mark as [string, SecretEnvKind, unknown, string[]?];
      //? A string a build moved is a secret wherever it sits: a credential URL is one under a plain key too.
      const held = underSecret || typeof literal === "string";
      const value = typeof literal === "string" ? literal : JSON.stringify(literal);
      found.variables.push({ name, kind, path: at, value, ...(ahead ? { ahead } : {}), literal, underSecret: held });
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
