import type { PromiseOrObject } from "akanjs/base";
import { sanitizeJson } from "akanjs/document";
import {
  descriptorHash,
  RawDocumentTable,
  type RawFilter,
  type RawFindOptions,
  type TransferRow,
} from "akanjs/service";
import { DocPath, type DocSlot } from "./docPath";
import type { MigrationChange } from "./migrationChangeLog";
import { MigrationScope } from "./migrationScope";

/** A path to its new value; `undefined` removes the path. */
export type MigrationPatch = Record<string, unknown>;

export interface MigrationRewriteOption {
  where?: RawFilter;
  /** Removed rows are rewritten too unless this is `false`. */
  withRemoved?: boolean;
  batchSize?: number;
}

/** Why a logged change was left as it is; `reverted` means it was undone. */
export type MigrationRevertOutcome = "reverted" | "changed" | "missing";

/**
 * A model's rows as stored, whatever the model declares now. Every write records what it changed in the run's change
 * log, in the same transaction, and leaves `updatedAt` alone: a migration reshapes data, it does not edit it.
 */
export class MigrationTable {
  static readonly #baseColumns = new Set(["id", "createdAt", "updatedAt", "removedAt"]);
  readonly name: string;
  readonly #raw: RawDocumentTable;
  readonly #scope: MigrationScope;

  constructor(name: string, scope: MigrationScope) {
    this.name = name;
    this.#scope = scope;
    this.#raw = new RawDocumentTable(name, () => scope.connection(), scope.dialect);
  }

  async find(where?: RawFilter, options?: RawFindOptions) {
    await this.#scope.beat();
    return await this.#raw.find(where, options);
  }

  async get(id: string) {
    await this.#scope.beat();
    return await this.#raw.get(id);
  }

  async count(where?: RawFilter, options?: Omit<RawFindOptions, "limit">) {
    await this.#scope.beat();
    return await this.#raw.count(where, options);
  }

  /** Returns whether anything changed: a value equal to the stored one is no change and is not logged. */
  async set(id: string, patch: MigrationPatch) {
    return await this.#write(id, (row) => this.#update(row, patch));
  }

  async unset(id: string, paths: string[]) {
    return await this.set(id, Object.fromEntries(paths.map((path) => [path, undefined])));
  }

  /** A soft removal, as the model's own `remove` makes. */
  async remove(id: string) {
    return await this.#write(id, (row) => (row.removedAt === null ? this.#update(row, {}, this.#scope.now()) : false));
  }

  async restore(id: string) {
    return await this.#write(id, (row) => (row.removedAt === null ? false : this.#update(row, {}, null)));
  }

  /** A new row; `doc` is its `_doc`, so `id` and the timestamps are not fields of it. */
  async insert(
    doc: Record<string, unknown>,
    { id, removedAt = null }: { id?: string; removedAt?: number | null } = {},
  ) {
    this.#assertWritable();
    const base = Object.keys(doc).find((key) => MigrationTable.#baseColumns.has(key));
    if (base) throw new Error(`"${base}" is a column of ${this.name}, not a field of its _doc`);
    return await this.#transaction(async () => await this.#insert(doc, id ?? this.#scope.createId(), removedAt));
  }

  /** A new row holding the source's `_doc` with `patch` applied, removed if the source is. */
  async copy(id: string, patch: MigrationPatch = {}) {
    this.#assertWritable();
    return await this.#transaction(async () => {
      const source = await this.#raw.get(id);
      if (!source) throw new Error(`${this.name} ${id} does not exist`);
      const doc = structuredClone(source._doc);
      MigrationTable.#apply(doc, patch);
      return await this.#insert(doc, this.#scope.createId(), source.removedAt);
    });
  }

  /**
   * `fn` sees each row in id order and returns a patch, or nothing to leave the row be. Outside a transaction every
   * batch commits with where it got to, so a run cut short resumes there; `fn` must still skip rows it already fixed.
   */
  async rewrite(
    fn: (row: TransferRow) => PromiseOrObject<MigrationPatch | null | undefined | false>,
    { where, withRemoved = true, batchSize = this.#scope.batchSize }: MigrationRewriteOption = {},
  ) {
    this.#assertWritable();
    MigrationScope.assertBatchSize(batchSize);
    const signature = await descriptorHash({ where: where ?? null, withRemoved, fn: fn.toString() });
    const { key, after: resumed } = this.#scope.nextRewrite(this.name, signature.slice(0, 12));
    let after = resumed;
    let scanned = 0;
    let changed = 0;
    for (;;) {
      const rows = await this.#transaction(async () => {
        const batch = await this.#raw.find(where, { after, limit: batchSize, withRemoved, lock: true });
        for (const row of batch) {
          scanned++;
          const patch = await fn(structuredClone(row));
          if (patch && (await this.#update(row, patch))) changed++;
        }
        const last = batch.at(-1);
        if (last) await this.#scope.reach(key, last.id);
        await this.#scope.beat();
        return batch;
      });
      after = rows.at(-1)?.id ?? after;
      if (rows.length < batchSize) break;
    }
    return { scanned, changed };
  }

  /**
   * Undoes one logged change if the row still holds what the change wrote; a row already back where the change found
   * it counts as undone, so a rollback cut short can run again.
   */
  async revert(change: MigrationChange): Promise<MigrationRevertOutcome> {
    this.#assertWritable();
    if (change.op === "delete") throw new Error("A rollback's own deletes are final; restore a backup to undo them");
    return await this.#transaction(async () => {
      const row = await this.#raw.get(change.id, { lock: true });
      if (change.op === "insert") {
        if (!row) return "reverted";
        if (!MigrationTable.#holds(row, change.after)) return "changed";
        await this.#raw.delete(row.id);
        await this.#scope.log?.append({
          table: this.name,
          id: row.id,
          op: "delete",
          before: { $doc: [row._doc], $removedAt: [row.removedAt] },
          after: {},
        });
        return "reverted";
      }
      if (!row) return "missing";
      if (MigrationTable.#holds(row, change.before)) return "reverted";
      if (!MigrationTable.#holds(row, change.after)) return "changed";
      const { $removedAt, ...docSlots } = change.before;
      const removedSlot: DocSlot | undefined = $removedAt;
      const patch = Object.fromEntries(
        Object.entries(docSlots).map(([path, slot]) => [path, slot.length ? slot[0] : undefined]),
      );
      try {
        MigrationTable.#apply(structuredClone(row._doc), patch);
      } catch {
        return "changed";
      }
      await this.#update(row, patch, removedSlot ? ((removedSlot[0] ?? null) as number | null) : undefined);
      return "reverted";
    });
  }

  //* Beats before the write's own transaction opens: a renewal inside one that rolls back would be undone with it.
  async #transaction<T>(fn: () => Promise<T>) {
    await this.#scope.beat();
    return await this.#scope.transaction(fn);
  }

  async #write(id: string, fn: (row: TransferRow) => Promise<boolean> | boolean) {
    this.#assertWritable();
    return await this.#transaction(async () => {
      const row = await this.#raw.get(id, { lock: true });
      if (!row) throw new Error(`${this.name} ${id} does not exist`);
      return await fn(row);
    });
  }

  async #update(row: TransferRow, patch: MigrationPatch, removedAt?: number | null) {
    const paths = Object.keys(patch);
    for (const path of paths) MigrationTable.#assertField(path);
    DocPath.assertDisjoint(paths);
    const doc = structuredClone(row._doc);
    MigrationTable.#apply(doc, patch);
    const before: Record<string, DocSlot> = {};
    const after: Record<string, DocSlot> = {};
    for (const anchor of DocPath.anchors(row._doc, paths)) {
      const previous = DocPath.read(row._doc, anchor);
      const next = DocPath.read(doc, anchor);
      if (DocPath.same(previous, next)) continue;
      before[anchor] = previous;
      after[anchor] = next;
    }
    const nextRemovedAt = removedAt === undefined ? row.removedAt : removedAt;
    if (nextRemovedAt !== row.removedAt) {
      before.$removedAt = [row.removedAt];
      after.$removedAt = [nextRemovedAt];
    }
    if (!Object.keys(after).length) return false;
    await this.#raw.write(row.id, { _doc: doc, removedAt: nextRemovedAt });
    await this.#scope.log?.append({ table: this.name, id: row.id, op: "update", before, after });
    return true;
  }

  async #insert(doc: Record<string, unknown>, id: string, removedAt: number | null) {
    const now = this.#scope.now();
    const stored = (sanitizeJson(doc) ?? {}) as Record<string, unknown>;
    await this.#raw.insert({ id, createdAt: now, updatedAt: now, removedAt, _doc: stored });
    await this.#scope.log?.append({
      table: this.name,
      id,
      op: "insert",
      before: {},
      after: { $doc: [stored], $removedAt: [removedAt] },
    });
    return id;
  }

  #assertWritable() {
    if (this.#scope.readOnly) throw new Error(`plan and verify only read; ${this.name} is written in apply`);
  }

  static #apply(doc: Record<string, unknown>, patch: MigrationPatch) {
    for (const [path, value] of Object.entries(patch)) {
      MigrationTable.#assertField(path);
      if (value === undefined) DocPath.remove(doc, path);
      else DocPath.write(doc, path, value);
    }
  }

  // An empty slot holds only while its parents are still containers: one replaced since is a change of its own.
  static #holds(row: TransferRow, slots: Record<string, DocSlot>) {
    return Object.entries(slots).every(
      ([path, slot]) =>
        DocPath.same(MigrationTable.#slot(row, path), slot) &&
        (slot.length > 0 || path.startsWith("$") || DocPath.hasParent(row._doc, path)),
    );
  }

  static #slot(row: TransferRow, path: string): DocSlot {
    if (path === "$removedAt") return [row.removedAt];
    if (path === "$doc") return [row._doc];
    return DocPath.read(row._doc, path);
  }

  static #assertField(path: string) {
    const root = path.split(".")[0] ?? "";
    if (MigrationTable.#baseColumns.has(root) || root.startsWith("$"))
      throw new Error(`"${path}" is not a field of _doc; remove and restore set removedAt`);
  }
}
