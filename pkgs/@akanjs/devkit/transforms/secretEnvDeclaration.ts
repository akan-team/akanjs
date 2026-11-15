import { existsSync } from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { SecretEnvEntry, SecretEnvKind } from "akanjs/server/lifecycle/secretEnv";
import { type SecretEnvMode, SecretEnvSource } from "./secretEnvSource";
import { ServerEnvProfile, type ServerEnvSource } from "./serverEnvProfile";

export interface SecretEnvVariable extends SecretEnvEntry {
  path: string;
  value: string;
}

export interface SecretEnvDeclared {
  variables: SecretEnvVariable[];
  /** Secret values the env holds that are not literals of an env file, so no build can read them from a variable. */
  unmoved: string[];
}

//* Evaluated with each secret literal marked as a build replaces it, so the list is the reads the built server holds.
export class SecretEnvDeclaration {
  static async of(envDir: string, environment: string): Promise<SecretEnvDeclared> {
    const file = path.join(envDir, "env.server.ts");
    if (!existsSync(file))
      throw new Error(`${file} is missing: \`akan sync\` writes the app's env files where it has none.`);
    const marked = await ServerEnvProfile.evaluate(
      file,
      path.dirname(envDir),
      (envFile) => SecretEnvDeclaration.source(envFile, "mark"),
      { environment, loads: ServerEnvProfile.envModulePattern },
    );
    const declared: SecretEnvDeclared = { variables: [], unmoved: [] };
    SecretEnvDeclaration.#collect(marked, [], false, declared);
    const variables = new Map<string, SecretEnvVariable>();
    for (const variable of declared.variables) {
      const taken = variables.get(variable.name);
      if (taken && taken.path !== variable.path)
        throw new Error(
          `${file} holds \`${taken.path}\` and \`${variable.path}\`, secrets a build would both read from the environment variable ${variable.name}. Rename one of the keys.`,
        );
      variables.set(variable.name, variable);
    }
    return { variables: [...variables.values()], unmoved: declared.unmoved };
  }

  static async source(file: string, mode: SecretEnvMode): Promise<ServerEnvSource> {
    const contents = await Bun.file(file).text();
    const name = path.basename(file, ".ts").slice("env.server.".length);
    if (name === "type" || name === "example") return { loader: "ts", contents };
    return { loader: "ts", contents: SecretEnvSource.rewrite(file, contents, mode) };
  }

  static #collect(value: unknown, keys: string[], underSecret: boolean, declared: SecretEnvDeclared): void {
    const at = keys.join(".");
    if (typeof value === "string") {
      if (ServerEnvProfile.isSecret(value, underSecret)) declared.unmoved.push(at);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      if (ServerEnvProfile.secretPaths(value, underSecret).length) declared.unmoved.push(at);
      return;
    }
    const mark = (value as { [key: string]: unknown })[SecretEnvSource.markKey];
    if (Array.isArray(mark)) {
      const [name, kind, held] = mark as [string, SecretEnvKind, unknown];
      declared.variables.push({ name, kind, path: at, value: typeof held === "string" ? held : JSON.stringify(held) });
      return;
    }
    for (const [key, child] of Object.entries(value))
      SecretEnvDeclaration.#collect(child, [...keys, key], underSecret || Logger.isSecretKey(key), declared);
  }
}
