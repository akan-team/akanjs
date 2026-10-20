import type { Logger } from "akanjs/common";
import type { AkanSqlClient, SqlDialect } from "akanjs/service";
import type { AkanServer } from "../akanServer";
import type { MigrationScope } from "./migrationScope";
import { MigrationTable } from "./migrationTable";

export type MigrationGet = AkanServer["get"];

export interface MigrationContextOption<Params> {
  id: string;
  params: Params;
  logger: Logger;
  get: MigrationGet;
  scope: MigrationScope;
}

export class MigrationContext<Params = Record<string, unknown>> {
  readonly id: string;
  readonly params: Params;
  readonly logger: Logger;
  /** A service, signal or adaptor of the booted server, as `server.get` resolves it. */
  readonly get: MigrationGet;
  readonly #scope: MigrationScope;
  readonly #tables = new Map<string, MigrationTable>();

  constructor({ id, params, logger, get, scope }: MigrationContextOption<Params>) {
    this.id = id;
    this.params = params;
    this.logger = logger;
    this.get = get;
    this.#scope = scope;
  }

  /** Rows of the model table `refName` as stored, whatever its model declares now. */
  readonly table = (refName: string) => {
    const existing = this.#tables.get(refName);
    if (existing) return existing;
    const table = new MigrationTable(refName, this.#scope);
    this.#tables.set(refName, table);
    return table;
  };

  readonly createId = () => this.#scope.createId();

  /** The connection the run writes through, inside its transaction when it has one. */
  get sql(): AkanSqlClient {
    return this.#scope.connection();
  }

  get dialect(): SqlDialect {
    return this.#scope.dialect;
  }
}
