import type { PromiseOrObject } from "akanjs/base";
import type { DocumentQuery, DocumentQueryHelper } from "./documentQuery";
import { documentQueryHelper } from "./documentQuery";
import type { CRUDEventType, SaveEventType } from "./into";

export type DocumentHookName = `before${Capitalize<SaveEventType>}` | `after${Capitalize<SaveEventType>}`;

export interface DocumentIndexDescriptor {
  name?: string;
  // Only 1 and -1 build a key. `"text"` (MongoDB's text index) builds nothing and warns, and the B-tree an earlier
  // version built from it is dropped: full-text search is a field's `text` role.
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

/** `previous` is the document before this write (absent on a create), for a hook asking whether it left a set. */
export type DocumentSaveHook<Doc = unknown> = (
  this: Doc,
  next?: () => void,
  type?: CRUDEventType,
  previous?: Doc,
) => PromiseOrObject<void>;

export class DocumentSchema<Doc = unknown> {
  readonly preHooks = new Map<SaveEventType, DocumentSaveHook<Doc>[]>();
  readonly postHooks = new Map<SaveEventType, DocumentSaveHook<Doc>[]>();
  readonly indexes: DocumentIndexDescriptor[] = [];

  pre<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    return this.#add(this.preHooks, type, hook);
  }

  post<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    return this.#add(this.postHooks, type, hook);
  }

  removePre<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    return this.#remove(this.preHooks, type, hook);
  }

  removePost<HookDoc = Doc>(type: SaveEventType, hook: DocumentSaveHook<HookDoc>) {
    return this.#remove(this.postHooks, type, hook);
  }

  #add(hooks: Map<SaveEventType, DocumentSaveHook<Doc>[]>, type: SaveEventType, hook: unknown) {
    const list = hooks.get(type) ?? [];
    list.push(hook as DocumentSaveHook<Doc>);
    hooks.set(type, list);
    return this;
  }

  // A removal replaces the array rather than splicing it: a write already running holds the list it started with,
  // so a listener that unsubscribes from inside a hook cannot make the loop skip the hook after it.
  #remove(hooks: Map<SaveEventType, DocumentSaveHook<Doc>[]>, type: SaveEventType, hook: unknown) {
    const list = hooks.get(type);
    if (list)
      hooks.set(
        type,
        list.filter((registered) => registered !== hook),
      );
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

export const getDefaultSchemaOptions = <_TSchema, TDocument>() => new DocumentSchema<TDocument>();
