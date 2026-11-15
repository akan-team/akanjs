import { createHash } from "node:crypto";

export type StatementVerb = "select" | "insert" | "update" | "delete" | "other";

export interface StatementShape {
  readonly fingerprint: string;
  /** The text with every literal a `?` and every placeholder list one `?, ...`: it never holds a value. */
  readonly text: string;
  readonly verb: StatementVerb;
  readonly table: string | null;
  readonly changesSchema: boolean;
}

const TOKEN = /'(?:[^']|'')*'|"(?:[^"]|"")*"|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
//? A path literal names a field, never a value; read as one, a filter on `title` and one on `ownerId` would merge.
const PATH_LITERAL = /^'(?:\$(?:[.[][^']*)?|\{[^':]*\})'$/;
const IN_LIST = /\bIN \(\s*\?(?:\s*,\s*\?)*\s*\)/gi;
const PLACEHOLDER_RUN = /\?(?:\s*,\s*\?)+/g;
const REPEATED_TUPLE = /(\((?:[^()]|\([^()]*\))*\))(?:\s*,\s*\1)+/g;
const NAME = String.raw`\s+(?:"((?:[^"]|"")+)"|([A-Za-z_][\w$]*))`;
const FROM_TABLE = new RegExp(String.raw`\bFROM${NAME}`, "i");
const TABLE_OF: Readonly<Partial<Record<StatementVerb, RegExp>>> = {
  select: FROM_TABLE,
  delete: FROM_TABLE,
  insert: new RegExp(String.raw`\bINTO${NAME}`, "i"),
  update: new RegExp(String.raw`^UPDATE${NAME}`, "i"),
};
const SCHEMA_CHANGE = /^(?:CREATE|DROP|ALTER)\s/i;
const VERBS: Readonly<Record<string, StatementVerb>> = {
  select: "select",
  with: "select",
  insert: "insert",
  replace: "insert",
  update: "update",
  delete: "delete",
};
const MAX_TEXT_LENGTH = 2_000;

export class StatementFingerprint {
  static readonly maxShapes = 500;
  static readonly maxTexts = 2_000;
  static readonly #byText = new Map<string, StatementShape>();
  static readonly #byFingerprint = new Map<string, StatementShape>();

  static of(sql: string): StatementShape {
    const known = StatementFingerprint.#byText.get(sql);
    if (known) return known;
    const text = StatementFingerprint.normalize(sql);
    const fingerprint = createHash("sha1").update(text).digest("hex").slice(0, 12);
    let shape = StatementFingerprint.#byFingerprint.get(fingerprint);
    if (!shape) {
      shape = StatementFingerprint.#shapeOf(fingerprint, text);
      StatementFingerprint.#remember(
        StatementFingerprint.#byFingerprint,
        fingerprint,
        shape,
        StatementFingerprint.maxShapes,
      );
    }
    StatementFingerprint.#remember(StatementFingerprint.#byText, sql, shape, StatementFingerprint.maxTexts);
    return shape;
  }

  static sizes() {
    return { shapes: StatementFingerprint.#byFingerprint.size, texts: StatementFingerprint.#byText.size };
  }

  static normalize(sql: string): string {
    return StatementFingerprint.scrub(sql)
      .replace(/\s+/g, " ")
      .trim()
      .replace(IN_LIST, "IN (?, ...)")
      .replace(PLACEHOLDER_RUN, "?, ...")
      .replace(REPEATED_TUPLE, "$1, ...");
  }

  static scrub(text: string): string {
    return text.replace(TOKEN, (token) => {
      if (token[0] === '"') return token;
      if (token[0] === "'") return PATH_LITERAL.test(token) ? token : "?";
      return "?";
    });
  }

  static scrubPlan(text: string): string {
    return text.replace(TOKEN, (token) => (token[0] === '"' ? token : "?"));
  }

  static #shapeOf(fingerprint: string, text: string): StatementShape {
    const verb = VERBS[/^\(?\s*([a-z]+)/i.exec(text)?.[1]?.toLowerCase() ?? ""] ?? "other";
    const table = TABLE_OF[verb]?.exec(text);
    return {
      fingerprint,
      text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text,
      verb,
      table: table ? (table[1]?.replaceAll('""', '"') ?? table[2] ?? null) : null,
      changesSchema: SCHEMA_CHANGE.test(text),
    };
  }

  static #remember<K>(map: Map<K, StatementShape>, key: K, shape: StatementShape, limit: number) {
    if (map.size >= limit) map.delete(map.keys().next().value as K);
    map.set(key, shape);
  }
}
