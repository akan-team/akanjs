import type { MigrationChange } from "./migrationChangeLog";
import type { MigrationRevertOutcome, MigrationTable } from "./migrationTable";

export interface MigrationSkip {
  table: string;
  id: string;
  seq: number;
  reason: string;
}

/** What a rollback walks: the run's changes newest first, each reverted or skipped with a reason the report shows. */
export class MigrationChanges {
  readonly entries: MigrationChange[];
  readonly skipped: MigrationSkip[] = [];
  reverted = 0;
  readonly #table: (name: string) => MigrationTable;

  constructor(entries: MigrationChange[], table: (name: string) => MigrationTable) {
    this.entries = entries;
    this.#table = table;
  }

  /** Undone only if the row still holds what the change wrote; a row edited since is skipped and reported. */
  async revert(change: MigrationChange): Promise<MigrationRevertOutcome> {
    const outcome = await this.#table(change.table).revert(change);
    if (outcome === "reverted") this.reverted++;
    else this.skip(change, outcome === "missing" ? "row no longer exists" : "row changed since the migration");
    return outcome;
  }

  skip(change: MigrationChange, reason: string) {
    this.skipped.push({ table: change.table, id: change.id, seq: change.seq, reason });
  }

  async revertAll() {
    for (const change of this.entries) await this.revert(change);
  }
}
