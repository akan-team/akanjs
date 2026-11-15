import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SecretEnv } from "akanjs/server/lifecycle/secretEnv";
import type { SecretEnvDeclared, SecretEnvVariable } from "./secretEnvDeclaration";

export type SecretEnvFormat = "k8s" | "dotenv";

export interface SecretEnvWrite {
  workspaceRoot: string;
  force?: boolean;
}

export class SecretEnvFile {
  static readonly formats = ["k8s", "dotenv"] as const;

  static listing({ variables, unmoved }: SecretEnvDeclared): string {
    if (!variables.length && !unmoved.length) return "The server env holds no secret value, so a build reads none.";
    const rows = [
      ["VARIABLE", "KIND", "SHELL", "ENV FILE KEY"],
      ...variables.map(({ name, kind, path: at }) => [name, kind, SecretEnv.read(name) ? "set" : "unset", at]),
    ];
    const widths = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
    const table = variables.length
      ? rows.map((row) =>
          row
            .map((cell, column) => cell.padEnd(widths[column] ?? 0))
            .join("  ")
            .trimEnd(),
        )
      : [];
    return [...table, ...(unmoved.length ? [SecretEnvFile.unmovedNote(unmoved)] : [])].join("\n");
  }

  static unmovedNote(unmoved: readonly string[]): string {
    if (!unmoved.length) return "";
    return `\`akan build\` stops at ${unmoved.join(", ")}: ${unmoved.length === 1 ? "a secret value" : "secret values"} the env file computes or imports. Write the string at the key, or read it there yourself as \`process.env.<NAME>\`.`;
  }

  static unmovedStop(app: string, environment: string, envFile: string, unmoved: readonly string[]): string {
    const one = unmoved.length === 1;
    return `The server env of ${app} (${environment}) holds ${one ? "a secret value" : `${unmoved.length} secret values`} this build cannot leave out, so it stops here: ${unmoved.join(", ")} (${envFile} and what it imports).\nA build turns a secret written as a string at its key into a read from the server's process env, and ${one ? "this one is" : "these are"} computed or imported. Write the string at the key, or read it there yourself as \`process.env.<NAME>\` and set that variable where the server is deployed. \`akan build --inline-secrets\` builds with the env files as written until akanjs 3.5.0 removes it.`;
  }

  static render(format: SecretEnvFormat, variables: readonly SecretEnvVariable[], name: string): string {
    return format === "k8s" ? SecretEnvFile.#k8s(variables, name) : SecretEnvFile.#dotenv(variables);
  }

  static #k8s(variables: readonly SecretEnvVariable[], name: string) {
    if (name.length > 253 || !/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(name))
      throw new Error(
        `--name ${name} is not a name a Kubernetes Secret can take: lowercase letters, digits, "-" and ".", starting and ending with a letter or digit.`,
      );
    const data = variables.map(({ name: key, value }) => `  ${key}: ${Buffer.from(value, "utf8").toString("base64")}`);
    return [
      "apiVersion: v1",
      "kind: Secret",
      "metadata:",
      `  name: ${name}`,
      "type: Opaque",
      ...(data.length ? ["data:", ...data] : ["data: {}"]),
      "",
    ].join("\n");
  }

  static #dotenv(variables: readonly SecretEnvVariable[]) {
    return variables.map(({ name, value }) => `${name}=${SecretEnvFile.#dotenvValue(name, value)}\n`).join("");
  }

  //? As Bun's .env loader reads a value back (1.4.4): it expands `$NAME` inside every kind of quote and takes `\$` for
  //? a dollar; only double quotes turn `\n` into a line break, and they keep `\"` and `\\` as two characters each.
  static #dotenvValue(name: string, value: string) {
    if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
    const dollars = value.replaceAll("$", "\\$");
    if (!/[\r\n]/.test(value) && !value.endsWith("\\"))
      for (const quote of ["'", "`"]) if (!value.includes(quote)) return `${quote}${dollars}${quote}`;
    if (!value.includes('"') && !value.includes("\\"))
      return `"${dollars.replaceAll("\r", "\\r").replaceAll("\n", "\\n")}"`;
    throw new Error(
      `${name} holds a mix of line breaks, quotes and backslashes no dotenv line carries unchanged. Write it with --format k8s, which keeps every byte.`,
    );
  }

  static async write(file: string, contents: string, { workspaceRoot, force = false }: SecretEnvWrite) {
    const target = path.resolve(file);
    const inWorkspace = path.relative(path.resolve(workspaceRoot), target);
    if (inWorkspace.split(path.sep)[0] === "dist")
      throw new Error(
        `--out ${file} is under dist/, and an image copies the whole of dist/apps/<app>, so the secrets would ship in it. Write the file outside dist/.`,
      );
    if (SecretEnvFile.#gitWouldTrack(target))
      throw new Error(
        `--out ${file} is inside a git repository that does not ignore it, so the secrets could be committed. Write it to a git-ignored path or outside the repository.`,
      );
    if (existsSync(target)) {
      if (!force) throw new Error(`--out ${file} exists. Pass --force to replace it.`);
      await rm(target);
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, { mode: 0o600, flag: "wx" });
  }

  static #gitWouldTrack(target: string) {
    let dir = path.dirname(target);
    while (!existsSync(dir) && dir !== path.dirname(dir)) dir = path.dirname(dir);
    try {
      //? Exit 0 is ignored, 1 is not ignored, and 128 is no repository at all.
      return Bun.spawnSync(["git", "check-ignore", "-q", "--", target], { cwd: dir }).exitCode === 1;
    } catch {
      return false;
    }
  }
}
