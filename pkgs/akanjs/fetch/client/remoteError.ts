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

/**
 * The caller's own `Err` when given one, else a duck-typed `Error` with the same payload, whose `toJSON` lets
 * `SignalContext.try` forward the remote key and data rather than generalize to `Internal Server Error`.
 */
export const restoreRemoteError = (
  body: unknown,
  fallbackStatusCode: number,
  ErrorCls?: ErrorConstructor,
): RestoredError => {
  const payload =
    body && typeof body === "object" && "error" in body
      ? ({ statusCode: fallbackStatusCode, ...(body as Record<string, unknown>) } as ErrorResponsePayload)
      : ({ error: String(body), statusCode: fallbackStatusCode } satisfies ErrorResponsePayload);
  if (ErrorCls) return ErrorCls.fromJSON(payload);
  const error = new Error(payload.error) as RestoredError;
  Object.assign(error, payload);
  // Only the fields the wire declares: an extra key a transport put on the frame is not part of the error.
  const json: ErrorResponsePayload = {
    error: payload.error,
    statusCode: payload.statusCode ?? fallbackStatusCode,
    ...(payload.code !== undefined ? { code: payload.code } : {}),
    ...(payload.details !== undefined ? { details: payload.details } : {}),
    ...(payload.data !== undefined ? { data: payload.data } : {}),
    ...(payload.path !== undefined ? { path: payload.path } : {}),
    ...(payload.timestamp !== undefined ? { timestamp: payload.timestamp } : {}),
  };
  error.toJSON = () => json;
  return error;
};
