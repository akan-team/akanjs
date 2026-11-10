import { Err } from "akanjs/common";

export interface ErrorResponsePayload {
  error: string;
  statusCode?: number;
  code?: string;
  data?: Record<string, unknown>;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

export interface RestoredError extends Error {
  error?: string;
  statusCode?: number;
  code?: string;
  data?: unknown;
  details?: unknown;
  path?: string;
  timestamp?: string;
  toJSON?: () => ErrorResponsePayload;
}

export interface ErrorConstructor {
  fromJSON: (payload: ErrorResponsePayload) => RestoredError;
}

export const restoreRemoteError = (
  body: unknown,
  fallbackStatusCode: number,
  ErrorCls: ErrorConstructor = Err,
): RestoredError => {
  const payload =
    body && typeof body === "object" && "error" in body
      ? ({ statusCode: fallbackStatusCode, ...(body as Record<string, unknown>) } as ErrorResponsePayload)
      : ({ error: String(body), statusCode: fallbackStatusCode } satisfies ErrorResponsePayload);
  return ErrorCls.fromJSON(payload);
};
