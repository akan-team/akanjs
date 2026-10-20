import { DatabaseAdaptorRole } from "akanjs/service";
import type { AkanServer } from "../akanServer";
import { AppInfo } from "../ops/appInfo";
import { type MigrationArgs, MigrationCommand, type MigrationCommandResult } from "./migrationCommand";
import { type MigrationEntry, MigrationRunner } from "./migrationRunner";

/** The migrations one build carries, as the generated `server.ts` lists them. */
export class Migrations {
  readonly entries: MigrationEntry[];

  constructor(entries: MigrationEntry[]) {
    this.entries = [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  /** On a started server: the runner writes through its database adaptor. */
  runner(server: AkanServer) {
    return new MigrationRunner(this.entries, {
      database: server.get(DatabaseAdaptorRole),
      get: server.get.bind(server),
      buildId: AppInfo.build().buildId,
    });
  }

  /** Boots `server` with no listener or schedule, runs one action, and prints its result last. Returns the exit code. */
  async command(server: AkanServer, argv: string[]) {
    let json = argv.includes("--json");
    let result: MigrationCommandResult;
    try {
      const args = MigrationCommand.parse(argv);
      json = args.json;
      result = await this.#run(server, args);
    } catch (error) {
      result = MigrationCommand.failure(null, error);
    }
    process.stdout.write(`${MigrationCommand.render(result, json)}\n`);
    return MigrationCommand.exitCode(result);
  }

  async #run(server: AkanServer, args: MigrationArgs) {
    await server.start({ listen: false, web: false, schedules: false });
    try {
      return await MigrationCommand.run(this.runner(server), args);
    } finally {
      await server.stop();
    }
  }
}
