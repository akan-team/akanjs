import { type AdaptorCls, adapt } from "../adapt";
import type { CacheAdaptor } from "./cache.adaptor";
import type { CompressAdaptor } from "./compress.adaptor";
import type { DatabaseAdaptor } from "./database.adaptor";
import type { LoggingAdaptor } from "./logging.adaptor";
import type { QueueAdaptor } from "./queue.adaptor";
import type { ScheduleAdaptor } from "./schedule.adaptor";
import type { StorageAdaptor } from "./storage.adaptor";
import type { WebsocketAdaptor } from "./websocket.adaptor";

export const DatabaseAdaptorRole = adapt("databaseAdaptorRole") as AdaptorCls<DatabaseAdaptor>;
export const CacheAdaptorRole = adapt("cacheAdaptorRole") as AdaptorCls<CacheAdaptor>;
export const StorageAdaptorRole = adapt("storageAdaptorRole") as AdaptorCls<StorageAdaptor>;
export const QueueAdaptorRole = adapt("queueAdaptorRole") as AdaptorCls<QueueAdaptor>;
export const ScheduleAdaptorRole = adapt("scheduleAdaptorRole") as AdaptorCls<ScheduleAdaptor>;
export const LoggingAdaptorRole = adapt("loggingAdaptorRole") as AdaptorCls<LoggingAdaptor>;
export const WebsocketAdaptorRole = adapt("websocketAdaptorRole") as AdaptorCls<WebsocketAdaptor>;
export const CompressAdaptorRole = adapt("compressAdaptorRole") as AdaptorCls<CompressAdaptor>;
