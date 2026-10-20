import { Logger } from "akanjs/common";
import { DatabaseAdaptorRole } from "akanjs/service";
import type { AkanServer } from "../akanServer";
import { AppInfo } from "../ops/appInfo";
import {
  type MigrationAction,
  type MigrationArgs,
  MigrationCommand,
  type MigrationCommandResult,
} from "./migrationCommand";
import { MigrationError } from "./migrationError";
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
  async command(server: AkanServer, argv: string[], invokedAs?: string) {
    let json = MigrationCommand.jsonOf(argv);
    let action: MigrationAction | null = null;
    let result: MigrationCommandResult;
    try {
      const args = MigrationCommand.parse(argv, invokedAs);
      ({ json, action } = args);
      result = await this.#run(server, args);
    } catch (error) {
      result = MigrationCommand.failure(action, error);
    }
    return await MigrationCommand.print(result, json);
  }

  async #run(server: AkanServer, args: MigrationArgs) {
    await server.start({ listen: false, web: false, schedules: false });
    try {
      return await MigrationCommand.run(this.runner(server), args);
    } finally {
      //? Logged, never thrown: it would replace the run's result, and an apply has committed by then.
      await server.stop().catch((error: unknown) => {
        new Logger("Migrations").error(`The server did not stop cleanly: ${MigrationError.messageOf(error)}`);
      });
    }
  }
}
