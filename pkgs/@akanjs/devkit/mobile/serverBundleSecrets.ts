import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ServerEnvProfile } from "../transforms/serverEnvProfile";

interface SecretValue {
  file: string;
  path: string;
  value: string;
}

//* A signed app leaves the building, and a notarized one goes to Apple first: before either, every secret value the
//* workspace's server env files hold is looked for in the server the app carries, whatever put it there.
export class ServerBundleSecrets {
  static readonly #largestFile = 64 * 1024 * 1024;

  constructor(
    readonly workspaceRoot: string,
    readonly appDir: string,
  ) {}

  /** The app's `env/env.server.<name>.ts` and every lib's, but the type and example files. */
  async envFiles(): Promise<string[]> {
    const libsDir = path.join(this.workspaceRoot, "libs");
    const libs = await readdir(libsDir).catch(() => [] as string[]);
    const dirs = [path.join(this.appDir, "env"), ...libs.map((lib) => path.join(libsDir, lib, "env"))];
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
        unread.push(path.relative(this.workspaceRoot, file));
      }
    }
    const found: string[] = [];
    for (const bundled of await ServerBundleSecrets.#files(bundleDir)) {
      const text = await readFile(bundled, "latin1");
      for (const secret of secrets)
        if (ServerBundleSecrets.#needles(secret.value).some((needle) => text.includes(needle)))
          found.push(
            `${path.relative(bundleDir, bundled)} holds ${path.relative(this.workspaceRoot, secret.file)} ${secret.path}`,
          );
    }
    if (found.length)
      throw new Error(
        `The server this app carries holds secret values from the workspace's env files, so it is not signed or sent anywhere:\n  ${[...new Set(found)].join("\n  ")}\nBuild its server with a profile (native.desktop.server.profile), whose bundle carries no secret.`,
      );
    return unread;
  }

  //? A multi-line key sits in a bundle as a JS string, escaped; one long line of it is enough to recognise.
  static #needles(value: string): string[] {
    const escaped = JSON.stringify(value).slice(1, -1);
    const line = value.split(/\r?\n/).find((part) => part.length >= 32);
    return [...new Set([value, escaped, ...(line ? [line] : [])])];
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
}
