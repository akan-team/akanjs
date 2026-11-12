import type { BackoffPolicy } from "./backoff";

/** Its first wait is 500 ms unless `min` names one. */
export interface RetryPolicy extends BackoffPolicy {
  /** Tries in all, the first one included; 4 unless named. */
  attempts?: number;
}

export interface FetchPolicy<_Returns = unknown> {
  /** @deprecated Read by nothing; an endpoint reuses its answer with `query(T, { cache })`. */
  cache?: boolean | number;
  crystalize?: boolean;
  origin?: string;
  /** @deprecated Read by nothing; catch the call's rejection instead. */
  onError?: (error: string) => void;
  token?: string;
  /** @deprecated Read by nothing; a query always answers its whole return. */
  partial?: string[];
  /** Milliseconds, or `false` to wait as long as the runtime will; overrides the endpoint's declared `timeout`. */
  timeout?: number | false;
  /**
   * Cancels a query, which then rejects with the signal's reason; its request stops once no other caller waits on it.
   * A mutation ignores it, since one already sent may have run.
   */
  signal?: AbortSignal;
  /**
   * `pubsub` only: called when the room may have missed events — after a resubscribe, at a frame the server dropped
   * for this socket, or once the server's link to the app's other servers returns — so refetch what the room shows.
   */
  onResync?: () => void;
  /**
   * Tries again when the server is unreachable, restarting (502/503), too slow (504) or limiting (429, after its
   * Retry-After). A mutation retries under one `Idempotency-Key`, which the server runs once; `false` turns a client's
   * default off.
   */
  retry?: RetryPolicy | false;
  /** Sent as `Idempotency-Key` on a mutation: a server that already ran it with this key answers that run's result. */
  idempotencyKey?: string;
  /**
   * Lets this mutation run while a page renders, where it is otherwise refused: opening a link to the page performs
   * it, so only a write that is harmless to repeat and safe for anyone to trigger may pass it.
   */
  duringRender?: boolean;
  /**
   * Marks a write that changes nothing a query reads back, such as a typing notice: queries already in flight and the
   * pages a link prefetched survive it, where any other write sends them again.
   */
  keepsReads?: boolean;
  /**
   * `false` sends a call made while the server renders a page without the visitor's session or address, so it answers
   * as to a stranger and the render can stay in the route result cache. An explicit `token` and a clone's `clientIp`
   * still go, and a browser's call is unchanged. Only for an endpoint that answers every caller alike: every visitor's
   * render then shares one budget under the server's own address, so give that endpoint `rateLimit: false` (or exempt
   * it) rather than an address budget, or one client forcing renders spends it for everyone.
   */
  forwardVisitor?: boolean;
}

export type SnakeCase<S extends string> = S extends `${infer T}_${infer U}` ? `${Lowercase<T>}_${SnakeCase<U>}` : S;
export type SnakeCaseObj<T> = {
  [K in keyof T as SnakeCase<K & string>]: T[K] extends object ? SnakeCaseObj<T[K]> : T[K];
};
export type SnakeMsg<Msg> = SnakeCaseObj<Msg>;

/** Name-based dispatch over a generated surface: `as DynamicRecord` to index, then cast the read, never `as any`. */
export type DynamicRecord<Value = unknown> = { [key: string]: Value };
