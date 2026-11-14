import { timingSafeEqual } from "node:crypto";
import { bearerTokenOf, EventStream, Logger } from "akanjs/common";
import { FailureLimiter } from "../ops/failureLimiter";
import { StatusAccess } from "../ops/statusAccess";
import type { LogHub, LogHubEntry } from "./logHub";
import { LogQueryMatcher } from "./logQuery";
import { LogStdoutWriter } from "./logStdoutWriter";

// A resume past the ring gets an explicit gap event: a monitor would read a silent skip as a quiet interval.
// Never log from a stream: one logging its own subscriptions at the level it delivers would feed on itself.
export class LogStreamRoute {
  static readonly path = "/_akan/app/logs";
  static readonly retryMs = 2_000;
  static readonly heartbeatMs = 15_000;
  //? A resume replays the ring before the reader takes a byte, so the bound holds a default ring's worth of lines.
  static readonly maxQueuedBytes = 4 * 1024 * 1024;
  static readonly maxDropped = 10_000;

  readonly #hub: () => LogHub | null;
  readonly #digest: Buffer;
  readonly #failures = new FailureLimiter({ limit: 10 });

  constructor(hub: () => LogHub | null, token: string) {
    this.#hub = hub;
    this.#digest = StatusAccess.digest(token);
  }

  /** Without a token the route is not registered at all, rather than mounted to answer "forbidden". */
  static fromEnv(hub: () => LogHub | null): LogStreamRoute | null {
    const token = process.env.AKAN_LOG_STREAM_TOKEN?.trim();
    if (!token) return null;
    if (/\s/.test(token)) {
      //* Off rather than mounted to refuse every caller: a bearer token is one word, so no request could present it.
      new Logger("LogStreamRoute").error(
        "Log stream disabled: AKAN_LOG_STREAM_TOKEN must be one word, with no whitespace",
      );
      return null;
    }
    return new LogStreamRoute(hub, token);
  }

  handle(req: Request, client?: string | null): Response {
    if (!this.#authorized(req, client))
      return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
    const hub = this.#hub();
    if (!hub) return new Response("Log hub is not running", { status: 503 });
    const query = LogQueryMatcher.parse(new URL(req.url).searchParams);
    const matcher = new LogQueryMatcher(query);
    let subscription: { unsubscribe(): void } | null = null;
    const stream = new EventStream(
      () => {
        subscription?.unsubscribe();
        subscription = null;
      },
      {
        keepAliveMs: LogStreamRoute.heartbeatMs,
        keepAliveChunk: ": heartbeat\n\n",
        maxQueuedBytes: LogStreamRoute.maxQueuedBytes,
        maxDropped: LogStreamRoute.maxDropped,
      },
    );
    stream.retry(LogStreamRoute.retryMs);
    const lastEventId = req.headers.get("last-event-id")?.trim();
    if (lastEventId && /^\d+$/.test(lastEventId)) LogStreamRoute.#resume(hub, stream, matcher, Number(lastEventId));
    subscription = hub.subscribe(query, (entry) => LogStreamRoute.#send(stream, entry));
    return stream.response();
  }

  #authorized(req: Request, client: string | null | undefined): boolean {
    const token = bearerTokenOf(req.headers.get("authorization"));
    if (!token || this.#failures.blocked(client)) return false;
    const matched = timingSafeEqual(StatusAccess.digest(token), this.#digest);
    if (!matched) this.#failures.fail(client);
    return matched;
  }

  static #resume(hub: LogHub, stream: EventStream, matcher: LogQueryMatcher, lastEventId: number) {
    if (lastEventId > hub.seq) {
      // The sequence restarted — a new process is answering — so nothing after that id can exist here.
      stream.write({ type: "gap", reason: "sequence-reset", lastEventId, currentSeq: hub.seq });
      return;
    }
    const { entries, gap } = hub.since(lastEventId);
    if (gap) stream.write({ type: "gap", reason: "ring-buffer-evicted", ...gap });
    for (const entry of entries) if (matcher.matches(entry.record)) LogStreamRoute.#send(stream, entry);
  }

  static #send(stream: EventStream, entry: LogHubEntry) {
    stream.write(LogStdoutWriter.json(entry), entry.seq);
  }
}
