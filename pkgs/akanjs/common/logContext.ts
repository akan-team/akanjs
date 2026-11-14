import type { LogRecord } from "./Logger";

/** A per-request ring of every record; the trace decides at its end whether any of it is shown. */
export interface LogFlightRecorder {
  minSev: number;
  capture(record: LogRecord, written: boolean): void;
}

export interface LogContextSnapshot {
  traceId: string | null;
  endpoint: string | null;
  origin: string | null;
  link?: string | null;
  flight?: LogFlightRecorder | null;
  /** A per-request floor below the process level (`x-akan-debug`); `null` when the request asked for nothing. */
  debugSev?: number | null;
}

export type LogContextReader = () => LogContextSnapshot | undefined;

// Pinned to `process`: the worker evaluates the app bundle and the framework runtime as separate module realms.
const slot: { __akanLogContextReader?: LogContextReader | null } =
  typeof process === "undefined" ? {} : (process as unknown as { __akanLogContextReader?: LogContextReader | null });

export const registerLogContextReader = (reader: LogContextReader | null) => {
  slot.__akanLogContextReader = reader;
};

export const readLogContext = () => slot.__akanLogContextReader?.();
