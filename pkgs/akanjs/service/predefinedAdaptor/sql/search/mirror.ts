import { FIELD_META } from "akanjs/base";
import { type ConstantField, type ConstantModel, type FieldObject, textFieldRoles } from "akanjs/constant";
import type { DatabaseModel } from "akanjs/document";
import { quoteIdent } from "../../sqlDescriptor";
import type { SearchColumns } from "./types";

export interface MirrorSegment {
  name: string;
  arrDepth: number;
}

/** The `search_doc` row both engines keep, and the parts of the SQL that fills it which read alike in both. */
export class SearchMirror {
  static readonly docColumns = textFieldRoles.map(quoteIdent).join(", ");
  static readonly upsertTail = `ON CONFLICT("ref", "refId") DO UPDATE SET ${textFieldRoles
    .map((role) => `${quoteIdent(role)} = excluded.${quoteIdent(role)}`)
    .join(", ")}`;
  // unicode61 breaks a token on every non-alphanumeric character, so a `key_value` pair carrying an email, a path
  // or a dotted id would split into fragments and stop matching as a pair. Only these are folded: the set covers
  // what ids and enum values actually contain, and each one costs another nested `replace`.
  static readonly #slugSeparators = [" ", "-", ".", "/", ":", "@", ",", "+", "#", "(", ")", "'"];

  static sqlString(value: string) {
    return value.replaceAll("'", "''");
  }

  static #slug(value: string) {
    return SearchMirror.#slugSeparators.reduce(
      (expression, separator) => `replace(${expression}, '${SearchMirror.sqlString(separator)}', '_')`,
      `lower(COALESCE(${value}, ''))`,
    );
  }

  // `NULLIF` drops the pair when the value is empty, so an unset field contributes no bare `key_` token.
  static filterToken(path: string, value: string) {
    const key = SearchMirror.sqlString(path.split(".").join("_"));
    return `NULLIF('${key}_' || ${SearchMirror.#slug(value)}, '${key}_')`;
  }

  static columnList(columns: SearchColumns) {
    return textFieldRoles.map((role) => columns[role]).join(", ");
  }

  /** The declared field behind each segment of a text path, or null when the model does not declare it. */
  static segments(fields: FieldObject, path: string): MirrorSegment[] | null {
    const segments: MirrorSegment[] = [];
    let current: FieldObject | undefined = fields;
    for (const name of path.split(".")) {
      const field: ConstantField | undefined = current?.[name];
      if (!field) return null;
      segments.push({ name, arrDepth: field.arrDepth });
      current = field.modelRef[FIELD_META] as unknown as FieldObject | undefined;
    }
    return segments;
  }

  /** Joins one expression per declared path into a column per role; null when the model declares no role at all. */
  static columns(
    constant: ConstantModel,
    database: DatabaseModel,
    expression: (segments: MirrorSegment[], path: string, role: string) => string,
  ): SearchColumns | null {
    const paths = constant.full.text;
    const fields = database.doc[FIELD_META] as unknown as FieldObject;
    if (!paths || !fields) return null;
    const columns = {} as SearchColumns;
    let declared = false;
    for (const role of textFieldRoles) {
      const rolePaths = [...paths[role], ...paths.children[role]];
      const parts = rolePaths.flatMap((path) => {
        const segments = SearchMirror.segments(fields, path);
        return segments ? [expression(segments, path, role)] : [];
      });
      if (parts.length) declared = true;
      columns[role] = parts.length ? `TRIM(${parts.join(` || ' ' || `)})` : `''`;
    }
    return declared ? columns : null;
  }
}
