import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BaseEnv, Dayjs } from "akanjs/base";
import { resolveDefaultSqliteFile } from "./sqlitePath";

export interface SolidConfig {
  filePath?: string;
  journalMode?: "WAL" | "DELETE" | "TRUNCATE" | "PERSIST" | "MEMORY" | "OFF";
  busyTimeoutMs?: number;
  synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
  cleanupIntervalMs?: number;
  queuePollIntervalMs?: number;
  queueLeaseMs?: number;
}

export interface SolidEnv extends BaseEnv {
  workspaceRoot?: string;
  solid?: SolidConfig;
}

export type SolidValueType = "string" | "number" | "buffer" | "json";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getSolidConfig = (env: SolidEnv): Required<SolidConfig> => {
  const appName = env.appName ?? "akan";
  const environment = env.environment ?? "local";
  const defaultFile = resolveDefaultSqliteFile({
    appName,
    fileName: `${appName}-${environment}_solid.db`,
    isProduction: process.env.NODE_ENV === "production",
    operationMode: env.operationMode,
    workspaceRoot: env.workspaceRoot,
  });
  return {
    filePath: env.solid?.filePath ?? process.env.AKAN_SOLID_DB_PATH ?? defaultFile,
    journalMode: env.solid?.journalMode ?? "WAL",
    busyTimeoutMs: env.solid?.busyTimeoutMs ?? 5000,
    synchronous: env.solid?.synchronous ?? "NORMAL",
    cleanupIntervalMs: env.solid?.cleanupIntervalMs ?? 60_000,
    queuePollIntervalMs: env.solid?.queuePollIntervalMs ?? 2000,
    queueLeaseMs: env.solid?.queueLeaseMs ?? 30_000,
  };
};

export const openSolidDatabase = async (config: Required<SolidConfig>) => {
  await mkdir(path.dirname(config.filePath), { recursive: true });
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const db = new Database(config.filePath, { strict: true, create: true });
      db.run(`PRAGMA busy_timeout = ${config.busyTimeoutMs}`);
      db.run(`PRAGMA journal_mode = ${config.journalMode}`);
      db.run(`PRAGMA synchronous = ${config.synchronous}`);
      return db;
    } catch (error) {
      lastError = error;
      if (!String(error instanceof Error ? error.message : error).includes("locked")) throw error;
      await wait(50 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

export const encodeSolidValue = (value: unknown): { type: SolidValueType; value: string | Buffer } => {
  if (Buffer.isBuffer(value)) return { type: "buffer", value };
  if (typeof value === "number") return { type: "number", value: String(value) };
  if (typeof value === "string") return { type: "string", value };
  // Objects, arrays, booleans, null: stored as JSON so callers can round-trip
  // structured values (e.g. refresh sessions) through the SQLite-backed cache.
  return { type: "json", value: JSON.stringify(value ?? null) };
};

export const decodeSolidValue = <T>(type: SolidValueType, value: string | Buffer | null): T | undefined => {
  if (value === null) return undefined;
  if (type === "buffer") return Buffer.isBuffer(value) ? (value as T) : (Buffer.from(value) as T);
  if (type === "number") return Number(value) as T;
  if (type === "json") return JSON.parse(typeof value === "string" ? value : value.toString()) as T;
  return String(value) as T;
};

export const toEpochMs = (value?: Dayjs | number | null) => {
  if (value == null) return null;
  if (typeof value === "number") return value;
  return value.toDate().getTime();
};
