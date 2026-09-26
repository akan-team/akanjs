import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { SnapshotRestore } from "./snapshotRestore";
import type { SnapshotSources } from "./snapshotTypes";
import { SqliteFiles } from "./sqliteFiles";
import { SqliteSnapshot } from "./sqliteSnapshot";

/**
 * `bun main.js ops <snapshot|restore>` — the same entry a production image already runs, because an image carries
 * no `akan` CLI. The app's own env names the files, so it runs with the container's env and nothing else.
 */
export class OpsCommand {
  static readonly usage = [
    "Usage:",
    "  bun main.js ops snapshot [--id <id>] [--out <dir>] [--include-solid] [--db <file>] [--solid-db <file>] [--json]",
    "  bun main.js ops restore <manifest.json> [--identity <file>] [--db <file>] [--solid-db <file>] [--force]",
  ].join("\n");

  static async run(argv: string[]): Promise<number> {
    const [command, ...rest] = argv;
    try {
      if (command === "snapshot") return await OpsCommand.#snapshot(rest);
      if (command === "restore") return await OpsCommand.#restore(rest);
      process.stderr.write(`${OpsCommand.usage}\n`);
      return 2;
    } catch (error) {
      process.stderr.write(`ops ${command}: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  static async #snapshot(argv: string[]) {
    const { values } = parseArgs({
      args: argv,
      options: {
        id: { type: "string" },
        out: { type: "string" },
        db: { type: "string" },
        "solid-db": { type: "string" },
        "include-solid": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
    });
    const sources = OpsCommand.#sources(values.db, values["solid-db"]);
    const capture = await SqliteSnapshot.capture({
      id: values.id ?? `snap-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      dir: path.resolve(values.out ?? SqliteFiles.snapshotDir(sources)),
      sources,
      includeSolid: values["include-solid"],
      encryptor: await OpsCommand.#encryptor(),
    });
    process.stdout.write(values.json ? `${JSON.stringify(capture)}\n` : `${JSON.stringify(capture, null, 2)}\n`);
    return 0;
  }

  static async #restore(argv: string[]) {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        identity: { type: "string" },
        db: { type: "string" },
        "solid-db": { type: "string" },
        force: { type: "boolean", default: false },
      },
    });
    const manifestPath = positionals[0];
    if (!manifestPath) throw new Error(`a manifest path is required\n${OpsCommand.usage}`);
    const running = values.force ? null : await OpsCommand.#runningApp();
    if (running)
      throw new Error(
        `${running} is answering on port ${process.env.PORT ?? "8282"}; stop it first (or pass --force if that is another app)`,
      );
    const { restored } = await SnapshotRestore.run({
      manifestPath: path.resolve(manifestPath),
      sources: OpsCommand.#sources(values.db, values["solid-db"]),
      decryptor: await OpsCommand.#decryptor(values.identity),
    });
    for (const { role, target, preservedAs } of restored)
      process.stdout.write(`restored ${role} → ${target}${preservedAs ? ` (previous kept at ${preservedAs})` : ""}\n`);
    return 0;
  }

  static #sources(db?: string, solidDb?: string): SnapshotSources {
    const fromEnv = SqliteFiles.fromEnv();
    return {
      main: db ? path.resolve(db) : fromEnv.main,
      solid: solidDb ? path.resolve(solidDb) : fromEnv.solid,
    };
  }

  //* Named from its own `/_akan/app/info`, so an operator whose port another app holds sees which one at once.
  static async #runningApp() {
    const base = `http://127.0.0.1:${process.env.PORT ?? "8282"}`;
    try {
      const health = await fetch(`${base}/_akan/app/health`, { signal: AbortSignal.timeout(1_000) });
      if (!health.ok) return null;
      const info = (await fetch(`${base}/_akan/app/info`, { signal: AbortSignal.timeout(1_000) })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)) as { appName?: string; environment?: string } | null;
      return info?.appName ? `${info.appName}/${info.environment ?? "?"}` : "An app";
    } catch {
      return null;
    }
  }

  static async #encryptor() {
    if (!process.env.AKAN_BACKUP_RECIPIENT?.trim()) return null;
    const { AgeEncryption } = await import("./ageEncryption");
    return await AgeEncryption.fromEnv();
  }

  static async #decryptor(identityFile = process.env.AKAN_BACKUP_IDENTITY_FILE) {
    if (!identityFile) return null;
    const { AgeEncryption } = await import("./ageEncryption");
    const identities = AgeEncryption.identitiesIn(await readFile(path.resolve(identityFile), "utf8"));
    if (!identities.length) throw new Error(`${identityFile} holds no AGE-SECRET-KEY-1 identity`);
    return await AgeEncryption.decryptor(identities);
  }
}
