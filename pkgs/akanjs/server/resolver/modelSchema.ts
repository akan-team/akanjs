import type { PromiseOrObject } from "akanjs/base";
import type { ConstantModel } from "akanjs/constant";
import {
  type CRUDEventType,
  type DatabaseModel,
  DocumentSchema,
  getFilterMeta,
  type SaveEventType,
} from "akanjs/document";

export const modelSchemaOf = (constant: ConstantModel, database: DatabaseModel): DocumentSchema => {
  const schema = new DocumentSchema();
  database.model._onSchema(schema as any);
  database.model._libsOnSchema(schema as any);
  const filterMeta = getFilterMeta(database.filter);
  const indexedSortFieldKeys = new Set<string>();
  for (const sort of Object.values(filterMeta.sort)) {
    if (!sort || typeof sort !== "object") continue;
    const sortFields = Object.entries(sort as Record<string, 1 | -1>);
    if (!sortFields.length) continue;
    const fields = Object.fromEntries([["removedAt", 1] as const, ...sortFields]);
    const key = Object.keys(fields).join(",");
    if (indexedSortFieldKeys.has(key)) continue;
    indexedSortFieldKeys.add(key);
    schema.index(fields);
  }
  // Non-base fields live in the `_doc` JSON column: without this index every cascade lookup is a table scan.
  for (const path of constant.full.cascade.removeWith.values()) {
    const fields = path.typeKey ? { removedAt: 1, [path.typeKey]: 1, [path.key]: 1 } : { removedAt: 1, [path.key]: 1 };
    const key = Object.keys(fields).join(",");
    if (indexedSortFieldKeys.has(key)) continue;
    indexedSortFieldKeys.add(key);
    schema.index(fields as { [key: string]: 1 | -1 });
  }
  return schema;
};

export const schemaListenerOf = (schema: DocumentSchema, phase: "pre" | "post") => {
  return (type: SaveEventType, listener: (doc: any, type: CRUDEventType, previous?: any) => PromiseOrObject<void>) => {
    const hook = function (this: any, _next?: () => void, crudType?: CRUDEventType, previous?: any) {
      return listener(this, crudType ?? "update", previous);
    };
    if (phase === "pre") schema.pre(type, hook);
    else schema.post(type, hook);
    return () => {
      if (phase === "pre") schema.removePre(type, hook);
      else schema.removePost(type, hook);
    };
  };
};

export type SchemaListener = ReturnType<typeof schemaListenerOf>;
