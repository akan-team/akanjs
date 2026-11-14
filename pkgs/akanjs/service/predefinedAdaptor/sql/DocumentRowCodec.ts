import { dayjs, FIELD_META } from "akanjs/base";
import { getDefault } from "akanjs/constant";
import { Err } from "akanjs/dictionary";
import { type DatabaseModel, sanitizeJson } from "akanjs/document";
import { DocumentStoreError } from "../../documentStoreError";
import { decodeFieldValue, normalizeWriteValue, primitiveDefault } from "./fieldValues";
import type { QueryCompiler } from "./QueryCompiler";
import {
  BASE_COLUMNS,
  type DocumentRecord,
  type FieldMap,
  type MutableDocumentRecord,
  type ProjectedSqliteDocumentRow,
  type ProjectionOption,
  type SqlDialect,
  type SqliteDocumentRow,
} from "./types";
import { assertStorableJson, encodeSqlValue, quoteIdent } from "./values";

// A literal default (every array field's `[]`) belongs to the model; uncopied, one document's `push` would reach it.
const freshDefault = (value: unknown) => (Array.isArray(value) ? [...(value as unknown[])] : value);

export class DocumentRowCodec {
  readonly #database: DatabaseModel;
  readonly #table: string;
  readonly #dialect: SqlDialect;
  readonly #compiler: QueryCompiler;

  constructor(database: DatabaseModel, table: string, dialect: SqlDialect, compiler: QueryCompiler) {
    this.#database = database;
    this.#table = table;
    this.#dialect = dialect;
    this.#compiler = compiler;
  }

  prepareDocument(data: DocumentRecord) {
    const fields = this.#database.doc[FIELD_META] as unknown as FieldMap;
    const doc: MutableDocumentRecord = {};
    for (const [key, field] of Object.entries(fields)) {
      const props = field.getProps();
      const value = data[key];
      if (value === undefined) {
        if (props.default !== undefined && props.default !== null) {
          doc[key] = freshDefault(typeof props.default === "function" ? props.default(data) : props.default);
        } else if (props.isClass && props.isScalar && !props.nullable) {
          // A nested scalar owns its field defaults, so it is constructible; a relation is not, and fails closed below.
          doc[key] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else if (!props.nullable && !["removedAt"].includes(key)) {
          if (["id", "createdAt", "updatedAt"].includes(key)) continue;
          throw new DocumentStoreError("invalidDocument", `Missing required field: ${key}`);
        }
      } else if (value === null && !props.nullable) {
        throw new DocumentStoreError("invalidDocument", `Field is not nullable: ${key}`);
      } else {
        doc[key] = value;
      }
      if (doc[key] !== undefined && doc[key] !== null) {
        doc[key] = normalizeWriteValue(doc[key], props);
      }
      if (props.enum && doc[key] !== undefined && doc[key] !== null) {
        const values = Array.isArray(doc[key]) ? doc[key] : [doc[key]];
        const fieldEnum = props.enum as { has: (value: unknown) => boolean } | undefined;
        const invalidValue = fieldEnum ? values.find((value: unknown) => !fieldEnum.has(value)) : undefined;
        if (invalidValue !== undefined) throw DocumentRowCodec.#invalidField(key, this.#table);
      }
      const validate = props.validate as ((value: unknown, doc: MutableDocumentRecord) => boolean) | undefined;
      if (validate && doc[key] !== undefined && doc[key] !== null && !validate(doc[key], doc)) {
        throw DocumentRowCodec.#invalidField(key, this.#table);
      }
    }
    return { ...data, ...doc };
  }

  // An enum or `validate` refusal is the caller's value, so a 400; the value is left out as it may be `field.secret`.
  static #invalidField(key: string, table: string) {
    return new Err.BadRequest("base.error.invalidField", { field: key }, { details: { model: table } });
  }

  toRow({ id, createdAt, updatedAt, removedAt, ...payload }: DocumentRecord) {
    return {
      id,
      createdAt: Number(encodeSqlValue(createdAt ?? dayjs())),
      updatedAt: Number(encodeSqlValue(updatedAt ?? dayjs())),
      removedAt: removedAt ? Number(encodeSqlValue(removedAt)) : null,
      _doc: assertStorableJson(JSON.stringify(sanitizeJson(payload)), this.#table),
    };
  }

  fromRow(row: SqliteDocumentRow) {
    const rawDoc: unknown = row._doc;
    const raw = typeof rawDoc === "string" ? JSON.parse(rawDoc) : (rawDoc as Record<string, unknown>);
    const payload = this.#decodeDocumentPayload(raw);
    return {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
      ...payload,
    };
  }

  #normalizeProjection(select: ProjectionOption): string[] | null {
    if (!select) return null;
    const fields = Object.entries(select)
      .filter(([, included]) => included)
      .map(([field]) => field);
    return [...new Set(fields.filter((field) => field !== "_doc"))];
  }

  resolveProjection(select: ProjectionOption): string[] | null {
    const projection = this.#normalizeProjection(select);
    if (projection !== null) return projection;
    return this.#defaultProjection();
  }

  #defaultProjection(): string[] | null {
    const fields = this.#database.doc[FIELD_META] as unknown as FieldMap;
    const entries = Object.entries(fields).filter(([key]) => !BASE_COLUMNS.has(key));
    if (!entries.some(([, field]) => field.getProps().select === false)) return null;
    return entries.flatMap(([key, field]) => (field.getProps().select === false ? [] : [key]));
  }

  projectionSql(fields: string[]) {
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    const baseColumns = [...BASE_COLUMNS].map((field) => quoteIdent(field));
    const jsonColumns = jsonFields.map(
      (field, idx) => `${this.#compiler.projectExpr(field)} AS ${quoteIdent(this.#projectionAlias(idx))}`,
    );
    return [...baseColumns, ...jsonColumns].join(", ");
  }

  #projectionAlias(idx: number) {
    return `__akan_projection_${idx}`;
  }

  fromProjectedRow(row: ProjectedSqliteDocumentRow, fields: string[]) {
    const doc: DocumentRecord = {
      id: row.id,
      createdAt: dayjs(Number(row.createdAt)),
      updatedAt: dayjs(Number(row.updatedAt)),
      removedAt: row.removedAt ? dayjs(Number(row.removedAt)) : undefined,
    };
    const jsonFields = fields.filter((field) => !BASE_COLUMNS.has(field));
    for (const [idx, field] of jsonFields.entries()) {
      const value = this.#dialect.decodeProjected(row[this.#projectionAlias(idx)]);
      const props = (this.#database.doc[FIELD_META] as unknown as FieldMap)[field]?.getProps?.();
      if (value === null && !props?.nullable) {
        if (props?.default != null) {
          doc[field] = freshDefault(
            typeof props.default === "function" ? (props.default as (data: unknown) => unknown)(doc) : props.default,
          );
        } else if (props?.isClass && props.isScalar) {
          doc[field] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else {
          doc[field] = primitiveDefault(props as Record<string, unknown>);
        }
      } else {
        doc[field] = props ? decodeFieldValue(value, props) : value;
      }
    }
    return doc;
  }

  #decodeDocumentPayload(payload: Record<string, unknown>) {
    const fields = this.#database.doc[FIELD_META] as unknown as FieldMap;
    const result: Record<string, unknown> = {};
    for (const [key, fieldMeta] of Object.entries(fields)) {
      if (BASE_COLUMNS.has(key)) continue;
      const props = fieldMeta.getProps();
      const value = payload[key];
      if (value === undefined) {
        const def = props.default;
        if (def != null) {
          result[key] = freshDefault(typeof def === "function" ? (def as (data: unknown) => unknown)(payload) : def);
        } else if (props.nullable) {
          result[key] = null;
        } else if (props.isClass && props.isScalar) {
          // A row from before the field was declared: `null` would fail the next save's own not-null check.
          result[key] = getDefault((props.modelRef as { [FIELD_META]: FieldMap })[FIELD_META] as never);
        } else {
          result[key] = primitiveDefault(props);
        }
      } else {
        result[key] = decodeFieldValue(value, props);
      }
    }
    for (const [key, value] of Object.entries(payload)) {
      if (key in result || BASE_COLUMNS.has(key)) continue;
      const props = fields[key]?.getProps?.();
      result[key] = props ? decodeFieldValue(value, props) : value;
    }
    return result;
  }
}
