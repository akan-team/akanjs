import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { AkanServer } from "../akanServer";
import { MigrationCommand } from "../migration/migrationCommand";
import type { Migrations } from "../migration/migrations";
import { SnapshotRestore } from "./snapshotRestore";
import type { SnapshotSources } from "./snapshotTypes";
import { SqliteFiles } from "./sqliteFiles";
import { SqliteSnapshot } from "./sqliteSnapshot";

/** What `main.js` lends a command that needs the app itself: its server module, imported with a replica's env. */
export interface OpsHost {
  importServer(): Promise<{ server?: AkanServer; migrations?: Migrations }>;
}

// Rides `bun main.js ops …` because a production image carries no `akan` CLI; the container's env names the files.
export class OpsCommand {
  static readonly usage = [
    "Usage:",
    "  bun main.js ops snapshot [--id <id>] [--out <dir>] [--include-solid] [--db <file>] [--solid-db <file>] [--json]",
    "  bun main.js ops restore <manifest.json> [--identity <file>] [--db <file>] [--solid-db <file>] [--force]",
    "  bun main.js ops migrate [list|plan|apply|verify|rollback] [<id>] [--param <name>=<value>]... [--expect <planHash>] [--items <n>] [--actor <id>] [--json]",
  ].join("\n");

  static async run(argv: string[], host?: OpsHost): Promise<number> {
    const [command, ...rest] = argv;
    try {
      if (command === "snapshot") return await OpsCommand.#snapshot(rest);
      if (command === "restore") return await OpsCommand.#restore(rest);
      if (command === "migrate") return await OpsCommand.#migrate(rest, host);
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

  static async #migrate(argv: string[], host?: OpsHost) {
    let app: { server: AkanServer; migrations: Migrations };
    try {
      app = await OpsCommand.#migratingApp(host);
    } catch (error) {
      //? A caller parsing the last line gets an answer from an image that cannot run migrations as well.
      return await MigrationCommand.print(MigrationCommand.failure(null, error), MigrationCommand.jsonOf(argv));
    }
    return await app.migrations.command(app.server, argv);
  }

  static async #migratingApp(host?: OpsHost) {
    if (!host) throw new Error("migrate boots the app's server, so it runs through main.js");
    const { server, migrations } = await host.importServer();
    if (!server?.start) throw new Error("server.js must export server");
    if (!migrations) throw new Error("this build lists no migrations; build it with an akan that writes the manifest");
    return { server, migrations };
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
