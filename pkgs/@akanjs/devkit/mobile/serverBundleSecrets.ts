import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ServerEnvProfile } from "../transforms/serverEnvProfile";

interface SecretValue {
  file: string;
  path: string;
  value: string;
}

//* A release leaves the building, signed or not, and an update goes to a feed anyone reads: before either, every secret
//* value the workspace's server env files hold is looked for in the server the app carries, whatever put it there.
export class ServerBundleSecrets {
  static readonly #largestFile = 64 * 1024 * 1024;
  static readonly #printer = new Bun.Transpiler({ loader: "js", target: "bun" });
  static readonly #notSource = new Set(["node_modules", "env", "private", "public", "dist"]);

  constructor(
    readonly workspaceRoot: string,
    readonly appDir: string,
  ) {}

  async envFiles(): Promise<string[]> {
    const dirs = [path.join(this.appDir, "env"), ...(await this.#libDirs()).map((lib) => path.join(lib, "env"))];
    const files = await Promise.all(
      dirs.map(async (dir) =>
        (await readdir(dir).catch(() => [] as string[]))
          .filter((name) => /^env\.server\.[A-Za-z0-9.-]+\.ts$/.test(name) && !/\.(type|example)\.ts$/.test(name))
          .map((name) => path.join(dir, name)),
      ),
    );
    return files.flat();
  }

  /** Refuses, naming files and key paths and never a value, when the bundle holds one; returns the env files it could not read. */
  async assertClean(bundleDir: string): Promise<string[]> {
    const unread: string[] = [];
    const secrets: SecretValue[] = [];
    for (const file of await this.envFiles()) {
      try {
        const value = await ServerEnvProfile.evaluate(file, path.dirname(path.dirname(file)));
        secrets.push(...ServerEnvProfile.secretValues(value).map((secret) => ({ file, ...secret })));
      } catch {
        unread.push(ServerBundleSecrets.#relative(this.workspaceRoot, file));
      }
    }
    if (!secrets.length) return unread;
    const sought = secrets.map((secret) => ({ secret, needles: ServerBundleSecrets.#needles(secret.value) }));
    const found: { bundled: string; secret: SecretValue }[] = [];
    for (const bundled of await ServerBundleSecrets.#files(bundleDir)) {
      const text = await readFile(bundled, "latin1");
      for (const { secret, needles } of sought)
        if (needles.some((needle) => text.includes(needle))) found.push({ bundled, secret });
    }
    const coded = found.length ? await this.#coded(found.map(({ secret }) => secret.value)) : new Set<string>();
    const leaks = found
      .filter(({ secret }) => !coded.has(secret.value))
      .map(
        ({ bundled, secret }) =>
          `${ServerBundleSecrets.#relative(bundleDir, bundled)} holds ${ServerBundleSecrets.#relative(this.workspaceRoot, secret.file)} ${secret.path}`,
      );
    if (leaks.length)
      throw new Error(
        `The server this app carries holds secret values of the workspace's env files, so the release stops here:\n  ${[...new Set(leaks)].join("\n  ")}\nBuild its server with a profile (native.desktop.server.profile), whose bundle leaves the env files' secrets out. A value a profile build still holds sits in code or a file the server carries: take it out there.`,
      );
    return unread;
  }

  //? A short or plain value the app's or a lib's own code holds as well (a default password) is that code's, which
  //? the bundle carries with or without the env file; a long mixed one is a secret copied into the code.
  async #coded(values: string[]): Promise<Set<string>> {
    const plain = [...new Set(values)].filter((value) => !ServerEnvProfile.distinctive(value));
    const coded = new Set<string>();
    if (!plain.length) return coded;
    for (const dir of [this.appDir, ...(await this.#libDirs())])
      for (const file of await ServerBundleSecrets.#sources(dir)) {
        const text = await readFile(file, "utf8");
        for (const value of plain) if (text.includes(value)) coded.add(value);
      }
    return coded;
  }

  async #libDirs() {
    const libsDir = path.join(this.workspaceRoot, "libs");
    return (await readdir(libsDir).catch(() => [] as string[])).map((lib) => path.join(libsDir, lib));
  }

  //? A multi-line key sits in a bundle as a JS string, escaped; one long line of it is enough to recognise. Bun prints
  //? a string's non-ASCII characters as `\xNN` / `\uNNNN`, and the bundle is read byte for byte, so as UTF-8.
  static #needles(value: string): string[] {
    const escaped = JSON.stringify(value).slice(1, -1);
    const line = value.split(/\r?\n/).find((part) => part.length >= 32);
    const forms = [value, escaped, ServerBundleSecrets.#printed(value), ...(line ? [line] : [])];
    return [...new Set(forms.map((form) => Buffer.from(form, "utf8").toString("latin1")))];
  }

  static #printed(value: string) {
    const code = ServerBundleSecrets.#printer.transformSync(`export default ${JSON.stringify(value)};`);
    return /^export default (["'`])([\s\S]*)\1;?\s*$/.exec(code)?.[2] ?? value;
  }

  static #relative(from: string, to: string) {
    return path.relative(from, to).split(path.sep).join("/");
  }

  static async #files(dir: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") files.push(...(await ServerBundleSecrets.#files(file)));
      } else if (entry.isFile() && (await stat(file)).size <= ServerBundleSecrets.#largestFile) files.push(file);
    }
    return files;
  }

  static async #sources(dir: string): Promise<string[]> {
    const files: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith(".")) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ServerBundleSecrets.#notSource.has(entry.name)) files.push(...(await ServerBundleSecrets.#sources(file)));
      } else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name))
        files.push(file);
    }
    return files;
  }
}
