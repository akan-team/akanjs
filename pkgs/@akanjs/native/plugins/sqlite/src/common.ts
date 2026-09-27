// Argument checks for the desktop implementation. ios/SqlitePlugin.swift and
// android/SqlitePlugin.kt + android/SqlStatements.kt follow the same rules and messages.
import { AkanNativeError } from "../../../packages/core/src/index.ts";

const invalid = (message: string) => new AkanNativeError("INVALID_ARGS", message);

/** Largest integer a JS number holds exactly: bigger integers bind as REAL on every platform. */
export const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * A database file name, never a path: no separators or "..", and no name that would collide with
 * another database's -journal, -wal or -shm file.
 */
export function checkName(name: unknown): string {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) ||
    /-(journal|wal|shm)$/i.test(name)
  ) {
    throw invalid(
      'name must be a file name: letters, digits, ".", "_" and "-", up to 128 characters, starting with a letter or digit, not ending in -journal, -wal or -shm',
    );
  }
  return name;
}

export function checkDb(db: unknown): string {
  if (typeof db !== "string" || db.length === 0) throw invalid("db must be a handle from open()");
  return db;
}

// Token classes and transitions of sqlite3_complete() (sqlite/src/complete.c, with triggers):
// a CREATE [TEMP] TRIGGER statement ends only at "END ;", so the semicolons inside its body do
// not count. Every other ";" outside quotes, [identifiers] and comments ends a statement.
const SEMI = 0,
  WS = 1,
  OTHER = 2,
  EXPLAIN = 3,
  CREATE = 4,
  TEMP = 5,
  TRIGGER = 6,
  END = 7;
const TRANS = [
  /* 0 INVALID */ [1, 0, 2, 3, 4, 2, 2, 2],
  /* 1 START   */ [1, 1, 2, 3, 4, 2, 2, 2],
  /* 2 NORMAL  */ [1, 2, 2, 2, 2, 2, 2, 2],
  /* 3 EXPLAIN */ [1, 3, 3, 2, 4, 2, 2, 2],
  /* 4 CREATE  */ [1, 4, 2, 2, 2, 4, 5, 2],
  /* 5 TRIGGER */ [6, 5, 5, 5, 5, 5, 5, 5],
  /* 6 SEMI    */ [6, 6, 5, 5, 5, 5, 5, 7],
  /* 7 END     */ [1, 7, 5, 5, 5, 5, 5, 5],
];

/** SQLite's IdChar(): letters, digits, "_", "$" and every non-ASCII character. */
const isIdChar = (c: number) =>
  (c >= 0x30 && c <= 0x39) ||
  (c >= 0x41 && c <= 0x5a) ||
  (c >= 0x61 && c <= 0x7a) ||
  c === 0x5f ||
  c === 0x24 ||
  c >= 0x80;

function keyword(word: string): number {
  switch (word.toLowerCase()) {
    case "create":
      return CREATE;
    case "temp":
    case "temporary":
      return TEMP;
    case "trigger":
      return TRIGGER;
    case "end":
      return END;
    case "explain":
      return EXPLAIN;
    default:
      return OTHER;
  }
}

/**
 * How many statements `sql` holds, finding their ends the way sqlite3_complete() does. Only
 * whitespace, comments and ";" is 0. An unterminated quote or comment runs to the end of the text
 * (the statement is then SQLite's syntax error to report).
 */
export function countStatements(sql: string): number {
  let state = 0;
  let count = 0;
  const n = sql.length;
  for (let i = 0; i < n; i++) {
    const c = sql.charCodeAt(i);
    let token = OTHER;
    if (c === 0x3b) token = SEMI;
    else if (c === 0x20 || c === 0x0d || c === 0x09 || c === 0x0a || c === 0x0c) token = WS;
    else if (c === 0x2f && sql.charCodeAt(i + 1) === 0x2a) {
      const close = sql.indexOf("*/", i + 2);
      i = close < 0 ? n : close + 1;
      token = WS;
    } else if (c === 0x2d && sql.charCodeAt(i + 1) === 0x2d) {
      const eol = sql.indexOf("\n", i + 2);
      i = eol < 0 ? n : eol;
      token = WS;
    } else if (c === 0x5b || c === 0x60 || c === 0x22 || c === 0x27) {
      const close = sql.indexOf(c === 0x5b ? "]" : sql[i]!, i + 1);
      i = close < 0 ? n : close;
    } else if (isIdChar(c)) {
      let j = i + 1;
      while (j < n && isIdChar(sql.charCodeAt(j))) j++;
      token = keyword(sql.slice(i, j));
      i = j - 1;
    }
    const next = TRANS[state]![token]!;
    if (token === SEMI && next === 1 && state > 1) count++;
    state = next;
  }
  return state > 1 ? count + 1 : count;
}

/** The bare words of `sql` (keywords and unquoted names), lowercase, skipping quotes and comments. */
function words(sql: string): string[] {
  const out: string[] = [];
  const n = sql.length;
  for (let i = 0; i < n; i++) {
    const c = sql.charCodeAt(i);
    if (c === 0x2f && sql.charCodeAt(i + 1) === 0x2a) {
      const close = sql.indexOf("*/", i + 2);
      i = close < 0 ? n : close + 1;
    } else if (c === 0x2d && sql.charCodeAt(i + 1) === 0x2d) {
      const eol = sql.indexOf("\n", i + 2);
      i = eol < 0 ? n : eol;
    } else if (c === 0x5b || c === 0x60 || c === 0x22 || c === 0x27) {
      const close = sql.indexOf(c === 0x5b ? "]" : sql[i]!, i + 1);
      i = close < 0 ? n : close;
    } else if (isIdChar(c)) {
      let j = i + 1;
      while (j < n && isIdChar(sql.charCodeAt(j))) j++;
      out.push(sql.slice(i, j).toLowerCase());
      i = j - 1;
    }
  }
  return out;
}

/**
 * Statements that reach files outside the app's databases: ATTACH opens any SQLite file the app
 * can read or write, VACUUM INTO writes one anywhere. The filesystem plugin's scopes do not apply
 * to them, so they are refused (the same rule in ios/SqlitePlugin.swift and android/SqlStatements.kt).
 */
export function refusedStatement(sql: string): string | null {
  const w = words(sql);
  let i = 0;
  if (w[i] === "explain") i += w[i + 1] === "query" && w[i + 2] === "plan" ? 3 : 1;
  if (w[i] === "attach") return "ATTACH is not allowed: open every database with open()";
  if (w[i] === "vacuum" && w.includes("into", i + 1))
    return "VACUUM INTO is not allowed: it writes a file outside the database";
  return null;
}

export function checkSql(sql: unknown): string {
  if (typeof sql !== "string") throw invalid("sql must be a string");
  const count = countStatements(sql);
  if (count === 0) throw invalid("sql holds no statement");
  if (count > 1) throw invalid("sql must be one statement; run them one call at a time");
  const refused = refusedStatement(sql);
  if (refused) throw new AkanNativeError("NOT_ALLOWED", refused);
  return sql;
}

// Standard alphabet (RFC 4648 §4), padding optional, no whitespace: the rule of
// plugins/filesystem/src/common.ts, which every platform decodes the same way.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function base64ToBytes(data: string): Uint8Array | null {
  if (!BASE64.test(data) || data.length % 4 === 1 || (data.includes("=") && data.length % 4 !== 0)) return null;
  const binary = atob(data.padEnd(Math.ceil(data.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export type Bound = string | number | bigint | null | Uint8Array;

/**
 * params → values to bind: integers within ±(2^53 − 1) and booleans as bigint (bun:sqlite binds a
 * number as INTEGER only below 2^52 and -0 as REAL: checked), other numbers as REAL, { base64 } as
 * bytes.
 */
export function checkParams(params: unknown): Bound[] {
  if (params === undefined || params === null) return [];
  if (!Array.isArray(params)) throw invalid("params must be an array");
  return params.map((value, i): Bound => {
    if (value === null || typeof value === "string") return value;
    if (typeof value === "boolean") return value ? 1n : 0n;
    if (typeof value === "number" && Number.isFinite(value))
      return Number.isInteger(value) && Math.abs(value) <= MAX_SAFE ? BigInt(value) : value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      const base64 = (value as { base64?: unknown }).base64;
      const bytes = keys.length === 1 && typeof base64 === "string" ? base64ToBytes(base64) : null;
      if (bytes) return bytes;
    }
    throw invalid(`params[${i}] must be a string, number, boolean, null or { base64 }`);
  });
}

/** A column value as the bridge carries it (see SqlValue). */
export function columnValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { base64: bytesToBase64(value) };
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (typeof value === "bigint") return Number(value);
  return value;
}

// Primary result codes (https://sqlite.org/rescode.html) that mean the SQL or its values do not
// fit the database: SQLITE_ERROR (syntax, no such table), TOOBIG, CONSTRAINT, MISMATCH, RANGE.
const CALLER_CODES = new Set([1, 18, 19, 20, 25]);

export function sqliteCode(extended: number): AkanNativeError["code"] {
  return CALLER_CODES.has(extended & 0xff) ? "INVALID_ARGS" : "INTERNAL";
}
