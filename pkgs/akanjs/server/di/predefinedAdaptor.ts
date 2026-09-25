import type { DatabaseMode } from "akanjs";
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
  LibsqlDatabase,
  type LoggingAdaptor,
  LoggingAdaptorRole,
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

export interface PredefinedAdaptor {
  database: AdaptorCls<DatabaseAdaptor>;
  cache: AdaptorCls<CacheAdaptor>;
  storage: AdaptorCls<StorageAdaptor>;
  queue: AdaptorCls<QueueAdaptor>;
  schedule: AdaptorCls<ScheduleAdaptor>;
  logging: AdaptorCls<LoggingAdaptor>;
  websocket: AdaptorCls<WebsocketAdaptor>;
  compress: AdaptorCls<CompressAdaptor>;
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
};

export const getPredefinedAdaptor = (mode: DatabaseMode = "single"): PredefinedAdaptor => {
  if (mode === "single") return predefinedAdaptor;
  return {
    ...predefinedAdaptor,
    database: mode === "cluster" ? PostgresDatabase : LibsqlDatabase,
    cache: RedisCache,
    queue: BullQueue,
    websocket: WebSocketRedisAdaptor,
  };
};
