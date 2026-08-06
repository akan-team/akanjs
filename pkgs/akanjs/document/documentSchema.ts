import type { PromiseOrObject } from "akanjs/base";
import type { DocumentQuery, DocumentQueryHelper } from "./documentQuery";
import { documentQueryHelper } from "./documentQuery";
import type { CRUDEventType, SaveEventType } from "./into";

export type DocumentHookName = `before${Capitalize<SaveEventType>}` | `after${Capitalize<SaveEventType>}`;

export interface DocumentIndexDescriptor {
  name?: string;
  // `"text"` is a Mongo-era alias that compiles to the same plain index as `1`; full-text search is declared with
  // `field(String, { text: … })` instead. Do not rewrite existing `"text"` call sites — the descriptor hash stored in
  // `_akan_meta` would change and `ensure()` throws `Index descriptor mismatch` on every live database.
  fields: Record<string, 1 | -1 | "text" | boolean>;
  unique?: boolean;
  where?: DocumentQuery;
}

export interface DocumentIndexBuilder<Schema> {
  path(path: string, order?: 1 | -1): DocumentIndexBuilder<Schema>;
  unique(): DocumentIndexBuilder<Schema>;
  where(where: DocumentQuery | ((q: DocumentQueryHelper) => DocumentQuery)): DocumentIndexBuilder<Schema>;
  done(): Schema;
}

export type DocumentSaveHook<Doc = unknown> = (
  this: Doc,
  next?: () => void,
  type?: CRUDEventType,
) => PromiseOrObject<void>;

export class DocumentSchema<Doc = unknown> {
  readonly preHooks = new Map<SaveEventType, DocumentSaveHook<Doc>[]>();
  readonly postHooks = new Map<SaveEventType, DocumentSaveHook<Doc>[]>();
  readonly indexes: DocumentIndexDescriptor[] = [];

  pre<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    const hooks = this.preHooks.get(type) ?? [];
    hooks.push(hook as unknown as DocumentSaveHook<Doc>);
    this.preHooks.set(type, hooks);
    return this;
  }

  post<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    const hooks = this.postHooks.get(type) ?? [];
    hooks.push(hook as unknown as DocumentSaveHook<Doc>);
    this.postHooks.set(type, hooks);
    return this;
  }

  hook(type: DocumentHookName, hook: DocumentSaveHook<Doc>) {
    const [, phase, event] = /^(before|after)(.+)$/.exec(type) ?? [];
    if (!phase || !event) throw new Error(`Invalid document hook: ${type}`);
    const saveType = `${event.charAt(0).toLowerCase()}${event.slice(1)}` as SaveEventType;
    return phase === "before" ? this.pre(saveType, hook) : this.post(saveType, hook);
  }

  index(fields: DocumentIndexDescriptor["fields"], options: Omit<DocumentIndexDescriptor, "fields"> = {}) {
    this.indexes.push({ ...options, fields });
    return this;
  }

  createIndex(name: string): DocumentIndexBuilder<this> {
    const schema = this;
    const descriptor: DocumentIndexDescriptor = { name, fields: {} };
    const api = {
      path(path: string, order: 1 | -1 = 1) {
        descriptor.fields[path] = order;
        return api;
      },
      unique() {
        descriptor.unique = true;
        return api;
      },
      where(where: DocumentQuery | ((q: DocumentQueryHelper) => DocumentQuery)) {
        descriptor.where = typeof where === "function" ? where(documentQueryHelper) : where;
        return api;
      },
      done() {
        schema.indexes.push(descriptor);
        return schema;
      },
    };
    return api;
  }
}

export type SchemaOf<Mdl = unknown, Doc = unknown> = DocumentSchema<Doc> & { readonly __model?: Mdl };
