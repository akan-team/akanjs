import type { MigrationChange } from "./migrationChangeLog";
import type { MigrationRevertOutcome, MigrationTable } from "./migrationTable";

export interface MigrationSkip {
  table: string;
  id: string;
  seq: number;
  reason: string;
}

/**
 * What a rollback walks with `for await`: the run's changes newest first, read a page at a time, each reverted or
 * skipped with a reason the report shows.
 */
export class MigrationChanges implements AsyncIterable<MigrationChange> {
  static readonly pageSize = 500;
  readonly skipped: MigrationSkip[] = [];
  reverted = 0;
  readonly #page: (below: number | null, limit: number) => Promise<MigrationChange[]>;
  readonly #table: (name: string) => MigrationTable;
  readonly #from: number | null;
  #reached: number | null;

  /** `from`: a seq a rollback cut short got down to, so walking resumes under it. */
  constructor(
    page: (below: number | null, limit: number) => Promise<MigrationChange[]>,
    table: (name: string) => MigrationTable,
    from: number | null = null,
  ) {
    this.#page = page;
    this.#table = table;
    this.#from = from;
    this.#reached = from;
  }

  async *[Symbol.asyncIterator]() {
    let below = this.#from;
    for (;;) {
      const page = await this.#page(below, MigrationChanges.pageSize);
      yield* page;
      const last = page.at(-1);
      if (!last || page.length < MigrationChanges.pageSize) return;
      below = last.seq;
    }
  }

  /** The oldest change `revertAll` has finished with; every newer one is reverted or skipped. */
  get reached() {
    return this.#reached;
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
    for await (const change of this) {
      await this.revert(change);
      this.#reached = change.seq;
    }
  }
}
