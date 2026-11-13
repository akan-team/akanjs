import type { DatabaseMode } from "akanjs";
import { AkanError, DatabaseModes, getEnv } from "akanjs/base";
import {
  type AdaptorCls,
  BlobStorage,
  BullQueue,
  type CacheAdaptor,
  CacheAdaptorRole,
  type CompressAdaptor,
  CompressAdaptorRole,
  ConsoleLogger,
  type DatabaseAdaptor,
  DatabaseAdaptorRole,
  JsonCompressor,
  type LlmAdaptor,
  LlmAdaptorRole,
  type LoggingAdaptor,
  LoggingAdaptorRole,
  OpenaiLlm,
  PostgresDatabase,
  type QueueAdaptor,
  QueueAdaptorRole,
  RedisCache,
  type ScheduleAdaptor,
  ScheduleAdaptorRole,
  Scheduler,
  SolidCache,
  SolidPubSub,
  SolidQueue,
  SqliteDatabase,
  type StorageAdaptor,
  StorageAdaptorRole,
  WebSocketRedisAdaptor,
  type WebsocketAdaptor,
  WebsocketAdaptorRole,
} from "akanjs/service";
import { collectAdaptors } from "./resolveHierarchy";

export interface PredefinedAdaptor {
  database: AdaptorCls<DatabaseAdaptor>;
  cache: AdaptorCls<CacheAdaptor>;
  storage: AdaptorCls<StorageAdaptor>;
  queue: AdaptorCls<QueueAdaptor>;
  schedule: AdaptorCls<ScheduleAdaptor>;
  logging: AdaptorCls<LoggingAdaptor>;
  websocket: AdaptorCls<WebsocketAdaptor>;
  compress: AdaptorCls<CompressAdaptor>;
  llm: AdaptorCls<LlmAdaptor>;
}

export const predefinedAdaptorRole = {
  database: DatabaseAdaptorRole,
  cache: CacheAdaptorRole,
  storage: StorageAdaptorRole,
  queue: QueueAdaptorRole,
  schedule: ScheduleAdaptorRole,
  logging: LoggingAdaptorRole,
  websocket: WebsocketAdaptorRole,
  compress: CompressAdaptorRole,
  llm: LlmAdaptorRole,
} satisfies PredefinedAdaptor;

export const predefinedAdaptor = {
  database: SqliteDatabase,
  cache: SolidCache,
  storage: BlobStorage,
  queue: SolidQueue,
  schedule: Scheduler,
  logging: ConsoleLogger,
  websocket: SolidPubSub,
  compress: JsonCompressor,
  llm: OpenaiLlm,
};

export const collectPredefinedDependencies = (adaptors: PredefinedAdaptor): AdaptorCls[] => {
  const roles = new Set<AdaptorCls>(Object.values(predefinedAdaptorRole));
  return [...collectAdaptors(Object.values(adaptors))].filter((adaptor) => !roles.has(adaptor));
};

// multiple: one SQLite WAL file on a shared host volume, the rest on Redis.
export const getPredefinedAdaptor = (mode: DatabaseMode = "single"): PredefinedAdaptor => {
  if (DatabaseModes.parse(mode, "The database mode") === "single") return predefinedAdaptor;
  return {
    ...predefinedAdaptor,
    database: mode === "cluster" ? PostgresDatabase : SqliteDatabase,
    cache: RedisCache,
    queue: BullQueue,
    websocket: WebSocketRedisAdaptor,
  };
};

// Fails the boot with what to fix, instead of an import error inside an adaptor's init.
export const resolveDatabaseMode = (): DatabaseMode => {
  const { environment, operationMode } = getEnv();
  const mode = DatabaseModes.resolve({
    requested: process.env.AKAN_DATABASE_MODE,
    declared: process.env.AKAN_DATABASE_MODES,
    local: environment === "local" || operationMode === "local",
  });
  const missing = DatabaseModes.drivers[mode].filter((driver) => {
    try {
      import.meta.resolve(driver);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length)
    throw new AkanError(
      "invalidConfig",
      `The ${mode} database mode imports ${missing.join(", ")}, which this build does not carry. Declare "${mode}" in database.modes of akan.config.ts: akan build bundles the drivers of every declared mode, and akan start installs them.`,
    );
  return mode;
};
