import type { Logger } from "akanjs/common";
import { DocumentStoreError } from "../../documentStoreError";
import type { DocumentRowCodec } from "./DocumentRowCodec";
import type { SqlDocumentStore } from "./SqlDocumentStore";
import type { DocumentRecord, ProjectedSqliteDocumentRow, SqliteDocumentRow } from "./types";
import { stableJson } from "./values";

export type StoredRow = Omit<SqliteDocumentRow, "id">;

// A field outside `fields` was never read: a save's comparison sees it only on a document that was given one.
interface ProjectedRead {
  row: ProjectedSqliteDocumentRow;
  fields: string[];
}

export type StoredRead = StoredRow | ProjectedRead;

export class StoredRows {
  /** The row a document was read or last written as. */
  static readonly storedRow = Symbol("akan.storedRow");
  /** Set on a document read as removed, which only a `withRemoved` read hands out. */
  static readonly readRemoved = Symbol("akan.readRemoved");
  readonly #store: SqlDocumentStore;
  readonly #codec: DocumentRowCodec;
  readonly #logger: Logger;
  #warnedUnread = false;

  constructor(store: SqlDocumentStore, codec: DocumentRowCodec, logger: Logger) {
    this.#store = store;
    this.#codec = codec;
    this.#logger = logger;
  }

  // A document with no stored row — built rather than read — changes every field it holds.
  changesOf(doc: DocumentRecord): DocumentRecord {
    const stored = (doc as Record<symbol, StoredRead | undefined>)[StoredRows.storedRow];
    if (!stored) {
      this.#warnUnread();
      return doc;
    }
    // Round-tripped so read-filled defaults and nested models rebuilt in declared order compare equal to themselves.
    const reread = this.hydrateStored(stored, String(doc.id));
    const read = StoredRows.encodedFields(this.#codec.toRow(reread));
    const held = StoredRows.encodedFields(this.#codec.toRow(doc));
    const changes: DocumentRecord = {};
    for (const field of new Set([...read.keys(), ...held.keys()]))
      if (read.get(field) !== held.get(field)) changes[field] = doc[field];
    return changes;
  }

  hydrateStored(stored: StoredRead, id: string) {
    return this.#store.hydrate(
      "fields" in stored
        ? this.#codec.fromProjectedRow(stored.row, stored.fields)
        : this.#codec.fromRow({ ...stored, id }),
      undefined,
      { track: false },
    );
  }

  // Key order is left out of the comparison: jsonb stores an object's keys in an order of its own.
  static encodedFields({ createdAt, removedAt, _doc }: StoredRow) {
    const fields = new Map(
      Object.entries(JSON.parse(_doc) as Record<string, unknown>).map(([field, value]) => [field, stableJson(value)]),
    );
    fields.set("createdAt", String(createdAt));
    fields.set("removedAt", String(removedAt ?? null));
    return fields;
  }

  #warnUnread() {
    if (process.env.NODE_ENV === "production" || this.#warnedUnread) return;
    this.#warnedUnread = true;
    this.#logger.warn(
      `A ${this.#store.table} document that was never read was saved, so every field it holds was written, undoing what ` +
        `other writes changed since it was built. Read the document before changing it, or write the fields with ` +
        `updateById().`,
    );
  }

  withStoredRow<Doc extends object>(doc: Doc, row: StoredRead): Doc {
    Object.defineProperty(doc, StoredRows.storedRow, { value: row, configurable: true });
    return doc;
  }

  // Marked on both read paths: a model with a `field.secret` reads every document projected.
  readAs<Doc extends object>(doc: Doc, { removedAt }: { removedAt?: unknown }): Doc {
    if (removedAt != null) Object.defineProperty(doc, StoredRows.readRemoved, { value: true, configurable: true });
    return doc;
  }

  // A removed row is outside the write path's scope, where `update` would answer a misleading NoDocumentError.
  assertLiveRow(doc: DocumentRecord) {
    if (!(doc as Record<symbol, unknown>)[StoredRows.readRemoved]) return;
    throw new DocumentStoreError(
      "invalidDocument",
      `read-only: a removed ${this.#store.table} is revived with updateById(id, { removedAt: null }, { withRemoved: true })`,
    );
  }
}
