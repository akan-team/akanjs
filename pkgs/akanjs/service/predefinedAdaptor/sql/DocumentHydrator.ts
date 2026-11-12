import { type DocumentTouchOptions, sanitizeJson } from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import type { DocumentRowCodec } from "./DocumentRowCodec";
import type { SqlDocumentStore } from "./SqlDocumentStore";
import { type StoredRead, StoredRows } from "./StoredRows";
import { type DocumentRecord, MODIFICATION_STATE, type ModificationState } from "./types";

export class DocumentHydrator {
  readonly #store: SqlDocumentStore;
  readonly #codec: DocumentRowCodec;
  readonly #rows: StoredRows;
  #docPrototype: object | null = null;

  constructor(store: SqlDocumentStore, codec: DocumentRowCodec, rows: StoredRows) {
    this.#store = store;
    this.#codec = codec;
    this.#rows = rows;
  }

  hydrate(data: DocumentRecord, originalData: DocumentRecord = data, { track = true }: { track?: boolean } = {}) {
    const isNew = !originalData.id;
    const hydratedData = isNew ? this.#codec.prepareDocument(data) : data;
    const doc = Object.assign(Object.create(this.#documentPrototype()), hydratedData);
    if (!track) return doc;
    Object.defineProperty(doc, MODIFICATION_STATE, {
      value: {
        isNew,
        // Cloned: `doc` shares nested objects with `hydratedData`, so an in-place push would move the baseline.
        original: JSON.parse(JSON.stringify(sanitizeJson(originalData) ?? {})) as Record<string, unknown>,
      } satisfies ModificationState,
    });
    return doc;
  }

  //* One prototype per store, extending the model's own so chain methods and `instanceof` hold; methods non-enumerable.
  #documentPrototype() {
    if (this.#docPrototype) return this.#docPrototype;
    const store = this.#store;
    const rows = this.#rows;
    this.#docPrototype = Object.create(store.database.doc.prototype, {
      set: {
        value(this: DocumentRecord, patch: DocumentRecord) {
          Object.assign(this, patch);
          return this;
        },
      },
      save: {
        async value(this: DocumentRecord, { touch }: DocumentTouchOptions = {}) {
          if (!this.id) return store.create(this);
          rows.assertLiveRow(this);
          return store.update(this.id as string, rows.changesOf(this), touch === false ? { touch } : {});
        },
      },
      refresh: {
        async value(this: DocumentRecord) {
          const fresh = (await store.pickById(this.id as string)) as DocumentRecord & Record<symbol, StoredRead>;
          Object.assign(this, fresh);
          Reflect.deleteProperty(this, StoredRows.readRemoved);
          return rows.withStoredRow(this, fresh[StoredRows.storedRow]);
        },
      },
      isModified: {
        value(this: DocumentRecord & { [MODIFICATION_STATE]?: ModificationState }, field?: string) {
          const state = this[MODIFICATION_STATE];
          if (!state)
            throw new DocumentStoreError(
              "invalidDocument",
              DocumentHydrator.#untrackedModificationMessage(store.table),
            );
          if (state.isNew) return true;
          if (!field) return JSON.stringify(sanitizeJson(this)) !== JSON.stringify(state.original);
          return JSON.stringify(sanitizeJson(this[field])) !== JSON.stringify(state.original[field]);
        },
      },
      toJSON: {
        value(this: DocumentRecord) {
          return sanitizeJson(this);
        },
      },
      toObject: {
        value(this: DocumentRecord) {
          return sanitizeJson(this);
        },
      },
    }) as object;
    return this.#docPrototype;
  }

  // Thrown, not guessed: `false` skips needed work and `true` redoes it (re-hashing a hashed password). Save hooks
  // always see a tracked document; only one straight out of a read lands here.
  static #untrackedModificationMessage(table: string) {
    return (
      `isModified() is unavailable on this ${table} document: it was loaded through a read query, which does not ` +
      `snapshot the row. Call it inside a save hook, or re-load the document through the write path (\`save()\`, ` +
      `\`update()\`) before comparing.`
    );
  }
}
