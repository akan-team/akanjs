import type { BackoffPolicy } from "./backoff";

/** Its first wait is 500 ms unless `min` names one. */
export interface RetryPolicy extends BackoffPolicy {
  /** Tries in all, the first one included; 4 unless named. */
  attempts?: number;
}

export interface FetchPolicy<Returns = unknown> {
  cache?: boolean | number;
  crystalize?: boolean;
  origin?: string;
  onError?: (error: string) => void;
  token?: string;
  partial?: string[];
  /** Milliseconds, or `false` to wait as long as the runtime will; overrides the endpoint's declared `timeout`. */
  timeout?: number | false;
  /** `pubsub` only: called after a resubscribe, since whatever was published while the socket was down is gone. */
  onResync?: () => void;
  /**
   * Tries again when the server is unreachable, restarting (502/503), too slow (504) or limiting (429, after its
   * Retry-After). A mutation retries under one `Idempotency-Key`, which the server runs once; `false` turns a client's
   * default off.
   */
  retry?: RetryPolicy | false;
  /** Sent as `Idempotency-Key` on a mutation: a server that already ran it with this key answers that run's result. */
  idempotencyKey?: string;
}

export type SnakeCase<S extends string> = S extends `${infer T}_${infer U}` ? `${Lowercase<T>}_${SnakeCase<U>}` : S;
export type SnakeCaseObj<T> = {
  [K in keyof T as SnakeCase<K & string>]: T[K] extends object ? SnakeCaseObj<T[K]> : T[K];
};
export type SnakeMsg<Msg> = SnakeCaseObj<Msg>;

/** Name-based dispatch over a generated surface: `as DynamicRecord` to index, then cast the read, never `as any`. */
export type DynamicRecord<Value = unknown> = { [key: string]: Value };
