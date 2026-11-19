# Logging

- Source: /cheatsheet/observability/logging
- Mirror: /llms/pages/cheatsheet/observability/logging.md
- Section: cheatsheet
- Category: Observability
- Priority: P2

## Headings

- Runtime Logging (#logging-overview)
- Using Logger (#using-logger)
- Log Levels (#log-levels)
- File Logging & Rotation (#file-logging)
- Reading Logs (#reading-logs)
- Live Tail (#live-tail)
- Request Line & Flight Recorder (#request-line)
- Collection: NDJSON stdout (#collection)
- Export: OpenTelemetry (#otlp-export)
- The SSE Stream (#log-stream)
- Operational Checklist (#operational-checklist)

## Content

Logging

off

Runtime Logging

A customer says a refund failed around four o'clock. With only twelve replicas' worth of stdout, nothing tells you which lines belonged to that call.

Akan makes every log line a record first. Lines from one request share a `traceId`, so the question above becomes one command: `akan logs myapp --trace <id>`.

Words used on this page

Term

- LogRecord: What one Logger call becomes: level, logger name, process and, inside a request, its trace.

- traceId: An id shared by every line one request writes, in the gateway, the replica and the RSC worker alike: 32 hex digits such as `0af7651916cd43dd8448eb211c80319c`. The response carries it as `x-request-id`, and a failed call's body as `traceId`.

- sink: A receiver registered with `Logger.addSink`, such as the rotating file or the hub.

- floor: The lowest level a sink or reader accepts. Records below it are dropped.

- hub: One journal of every process's records, kept by the gateway or by a solo replica.

- child replica: A server process behind the gateway. It sends its records to the hub over IPC.

What a record carries

Field

- level, sev: The level name and its OpenTelemetry severity number.

- name, context: The logger name, and the context string passed as the second argument.

- role, replicaIdx, pid: Which process wrote it. role is gateway, all, federation, batch or rsc-worker.

- traceId, endpoint, origin: Filled only inside a request, such as `mutation:refundPayment` arriving over `http`.

- link: Present when the request was handed an id it did not take: its caller's, or for a job the enqueuing trace's.

- attrs: Structured key=value data attached with `Logger.emit`.

One record, from the call to the collector

floor: minLevel, else AKAN_LOG_FILE_LEVEL

Child replica

LogForwarder over IPC

Hub owner

gateway, or the solo replica

Ring buffer

up to AKAN_LOG_BUFFER records

Container stdout

text or ndjson

Rotating file

**Never call `logger.log()`.** It reads like a level of its own but emits at `info`, so a line meant to stay quiet shows up in production output. Write `.info()`.

Using Logger

Services and adapters already carry `this.logger`, named after the service or adapter. Pick the method that matches the intent:

**The second argument is a context string.** It prints as `[invoice-sync]` after the level; add it when one logger handles several jobs.

**`error` goes to stderr,** every other level to stdout. An adapter catches, logs with `this.logger.error`, and returns `null`.

**Outside a service or adapter,** create one with `new Logger("CsvImporter")`, or call the static `Logger.info(msg, context, name)` for a one-off line.

Structured values go in attrs

A value you will filter or query on belongs in `attrs`, not in the message text:

**One call, two readers.** Text output prints attrs as `key=value` after the message, and ndjson carries them as a JSON object, so a terminal can grep and a collector can query.

**Values are primitives:** `string`, `number`, `boolean` or `null`.

**Secret-looking keys are masked before the record exists.** A key containing token, password, passwd, jwt, authorization, cookie, secret, credential, webhook, api_key, private_key or access_key, in any case, or `cred` as a word of its own, becomes `"[redacted]"`, so no sink ever sees the value.

Log Levels

There are six levels. The number beside each is its OpenTelemetry severity, not an index from 0 to 5.

Level

Severity

Description

- trace: Every step, including the ones that are only interesting once. — 1

- verbose: Detail a developer asks for on purpose. It is TRACE's upper tier, not a band of its own. — 3

- debug: Diagnosis for one subsystem while you are working on it. — 5

- info: Normal lifecycle events. The production default. — 9

- warn: Recovered: it kept going, and somebody should know. — 13

- error: An operation failed or needs attention. Written to stderr, not stdout. — 17

ndjson output, the SSE payload and a numeric `--level` filter all carry this number, so a table that renumbers the levels disagrees with the wire.

Three level settings

Each answers a different question: what a person at the terminal wants, what stdout ships to a collector, and how deep a sink with no floor goes.

- AKAN_PUBLIC_LOG_LEVEL (trace | verbose | debug | info | warn | error, default info): The console level. `log` means info (deprecated); an unknown name silently becomes info.

- AKAN_LOG_STDOUT_LEVEL (trace | verbose | debug | info | warn | error, default AKAN_PUBLIC_LOG_LEVEL): What stdout carries. Overrides `AKAN_PUBLIC_LOG_LEVEL`; in ndjson, also a child's forwarding floor.

- AKAN_LOG_FILE_LEVEL (trace | verbose | debug | info | warn | error, default trace): The floor for every sink without `minLevel`, the rotating file and the hub included.

To change them at runtime, call `Logger.setLevel(level)` and `Logger.setFileLevel(level)`.

**Give every sink a floor: `Logger.addSink(sink, { minLevel: "info" })`.** A sink without one follows `AKAN_LOG_FILE_LEVEL`, which defaults to `trace`. One floorless sink makes every `trace` and `verbose` call in the process build a record instead of being rejected at the level check.

File Logging & Rotation

A server writes rotating log files under `<runtimeDir>/logs`. Each process gets its own file and rotates on its own, by local date and by size.

Under `akan start`, the gateway and each child replica write their own file:

Every name follows `appName-environment-operationMode-YYYY-MM-DD-processKey-sequence.log`:

Name part

Meaning

- appName-environment-operationMode: App name, environment and operation mode, such as `myapp-local-local`.

- YYYY-MM-DD: The local date. On a new date the sequence starts again at `0001`.

- processKey: `gateway`, `<replicaIdx>-<role>` for a child, or the role alone for a solo replica.

- sequence: Four digits. A restart moves on to the next number instead of overwriting.

- AKAN_LOG_TO_FILE (0 | 1, default on (0 in the Docker image)): Only the exact string `0` turns file logging off; `false` does not.

- AKAN_LOG_DIR (string, default <runtimeDir>/logs): Log directory. A relative path resolves from the process's working directory.

- AKAN_LOG_MAX_SIZE_MB (number, default 50): Past this size, writing moves on to the next sequence file.

- AKAN_LOG_MAX_FILES (number, default 100): Newest files kept per process key. Older ones are deleted.

**Where `<runtimeDir>` is:** `runtime/` under `NODE_ENV=production`, otherwise `local/apps/<app>/runtime` under the workspace root (`local/libs/<lib>/runtime` for a lib's tests). `AKAN_RUNTIME_DIR` overrides both.

**The Docker image turns files off.** A container's writable layer is ephemeral, so stdout is the collection path there; set `AKAN_LOG_TO_FILE=1` to get the files back.

Reading Logs

When the app accepts no traffic, start with the gateway log. Then read the child log that handled the request or background job.

The files are plain text, so ordinary tools work:

List current log files

Follow the gateway

Follow one child replica

Search for errors

On a server with AKAN_LOG_DIR=/var/log/akan

**Child lines carry a prefix** such as `[child:0 all] [stderr]`, so one search shows which replica and which stream wrote them.

**Child stderr reaches the file even when the terminal hides it.** While it writes a log file, the gateway prints a child's stderr only with `AKAN_CHILD_STDERR=1`; without one, as in the image, it always prints it. A child's own Logger errors go to stdout, so they always show.

**`console.log` in a child is captured** through its stdout/stderr pipes. In the gateway process it bypasses the Logger sinks, so use Logger in runtime code.

**`akan start` also writes `dev.log`** in the runtime directory: every process of the app plus the dev host's build output, with no ANSI. The previous session stays as `dev.prev.log`.

Live Tail

A running gateway, or a replica running alone, keeps recent records in a ring buffer and serves them on `akan-control.sock` in the runtime directory. `akan logs` and `.tail` in `akan console` attach to it.

The socket is chmod 0600 and opens no TCP port: filesystem permission is the whole authentication.

warn and above from any mutation, whose message mentions payment

One request, start to finish

What the RSC worker rendered, with the last 50 buffered records first

History only, as NDJSON

In dev, what browser and native-shell pages threw

The same filters inside akan console

- --level (string): Minimum level, by name or by severity number.

- --grep (string): Substring the message must contain.

- --endpoint (string): Endpoint globs, comma-separated: `mutation:*`, `query:userList`.

- --trace (string): One request's traceId, or an id it linked: the one its caller sent, as sent.

- --child (string): Replica indexes, comma-separated.

- --role, -R (string): Process roles: `gateway`, `all`, `federation`, `batch`, `rsc-worker`.

- --origin (string): Call origins: `http`, `websocket`, `mcp`, `internal`, `page`.

- --since (string): Only records newer than this: `30s`, `5m`, `2h`, `1d`, or epoch ms.

- --replay, -n (number, default 0): Records to replay from the buffer before following.

- --json (boolean, default false): Print NDJSON records instead of rendered lines.

- --follow (boolean, default true): Keep streaming. Pass `--follow false` for history only.

- --runtime-dir, -d (string, default local/apps/<app>/runtime): Directory holding `akan-control.sock`. Pass it for a built app running elsewhere.

- Filters Combine — Flags AND together; a comma list inside one flag is an OR. `*` is the only wildcard, for endpoints and logger names, and an endpoint reads `type:key`, as in `mutation:refundPayment` or `page:<routeId>`.

- Free While Nobody Watches — A child forwards over IPC only while a subscriber wants that level; under ndjson it always sends what stdout carries. `AKAN_LOG_STREAM=1` forwards everything, always.

- Bounded Ring — The hub owner keeps 2,000 records or 4MB (`AKAN_LOG_BUFFER`, `AKAN_LOG_BUFFER_MB`). More than 20 identical lines a second fold into one "suppressed" line there and in the log file; request lines never fold, and the ndjson stdout gets every record.

- Lines Without Context — Gateway lines written outside a request, the scheduler's own started/finished lines and unauthenticated primitive GET queries on the fast path carry no traceId or endpoint. `AKAN_LOG_CONTEXT=0` turns the endpoint context off everywhere; the gateway and the replica still write the request's id.

Request Line & Flight Recorder

Two opt-ins cut noise instead of filtering it: one summary line per call, and trace-level detail only for the calls that went wrong.

- Request Line — Writes one record when a call ends, so a request is one line to grep instead of a dozen. — AKAN_LOG_CANONICAL=1

- Flight Recorder — Holds each call's records below the level and promotes them, marked flight=true, only if it failed or ran long. — AKAN_LOG_FLIGHT=1

With the process level left at info, you still get trace detail for exactly the request that failed.

What the request line carries

- ok | error <endpoint>: The message. A clean call is written at info, a failure under 500 at warn, and a 5xx at error with the error's type and stack.

- ms, status: Duration and status. On failure, status is the one HTTP answers: an AkanError's statusCode, otherwise 500.

- userId: The caller's account id, once the call knows who is asking.

- link: An id the call was handed but did not take: the `traceparent` or `x-request-id` a caller sent, or for a queued job the trace that enqueued it. Every record of the call carries it as `link` too.

- queueMs: On a page's line, how long its render waited for a render slot under `AKAN_RSC_WORKER_MAX_CONCURRENCY`; absent when it did not wait. With `AKAN_TRACE=1` the wait is also the span `renderQueue`.

- db, dbMs, cacheHit: SQL statements sent, their time with any wait, and the cache hit ratio, only under `AKAN_TRACE=1`. A statement slower than `AKAN_LOG_SLOW_STATEMENT_MS` writes its own `SlowStatement` line with this call's `traceId` (see Metrics, Find Slow Statements).

- err: The first line of the error message, cut at 200 characters.

Settings

- AKAN_LOG_CANONICAL (1 | true | all | slow, default off): One summary record per call. `slow` keeps only failures and calls over `AKAN_LOG_FLIGHT_MS`.

- AKAN_LOG_FLIGHT (1 | true, default off): Keeps each call's last 64 sub-level records, promoted only if it failed or ran long.

- AKAN_LOG_FLIGHT_MS (number, default 1000): The slow threshold, shared by the flight recorder and `slow` mode.

- AKAN_LOG_FLIGHT_MAX (number, default 65536): Records held at once across calls (1,024 calls at 64 each); past it a call runs unrecorded.

- AKAN_LOG_DEBUG_HEADER (string, default unset): Secret for `x-akan-debug`, which lowers one request to trace, records its spans and answers with `Server-Timing`. Unset, it works only in local. With `AKAN_DEVTOOLS=true` it also opens devtools and Studio outside local.

- AKAN_TRACE (1, default off): Adds db and cache figures to the request line, and per-stage spans to metrics, one `db:<model>.<op>` span per SQL statement sent among them (the first 32 of a request; `db` and `dbMs` count them all, `BEGIN` and `COMMIT` included, without a span), or per model call for a store that sends none through the SQLite or Postgres driver.

One request at trace in production

Send the secret in `x-akan-debug`, and that request alone is logged at trace:

that request alone is logged at trace, its lines marked debug=true

**The id on a response is the server's own.** A request that arrives with a W3C `traceparent`, or else an `x-request-id` that is a UUID or 32 hex digits, gets a fresh id and keeps the caller's as `link`, on every record it writes. `akan logs --trace` matches `link` too and takes the id as the caller sent it, so a caller's own id still finds its request. Only the gateway's hop to its replica carries an id over. `AKAN_TRACE_ADOPT=trusted-proxies` lets a proxy that `AKAN_TRUSTED_PROXIES` lists by address choose the id; turn it on only when that proxy overwrites or strips both headers.

**The id follows what the request starts.** A page's render in the RSC worker, the `fetch` calls a server makes to this app or to a `clone({ origin })`, and every frame of a websocket (under its handshake's id) write the same `traceId`. A queued job gets an id of its own and names the enqueuing one as `link`.

**Promoted lines pass every floor.** A `flight=true` or `debug=true` record was asked for below the level, so a forwarder's floor, the stdout level and `--level` let it through.

**Nothing is printed twice.** Only lines no one wrote are promoted; if a call overflowed its 64-record ring, the first promoted line carries `flightEvicted=N`.

**A wrong header value is ignored, not refused.** The request simply runs at the normal level.

**Measured cost:** the recorder adds about 190ns to a clean call, and the gate about 20ns per rejected log call inside a trace. Both are off by default; the memory cap is the operator's decision.

Collection: NDJSON stdout

Collection and live viewing are different problems. Collection must lose nothing and survive restarts, so it goes through the container's stdout.

**One writer.** Under `AKAN_LOG_FORMAT=ndjson` the hub owner alone writes stdout, one JSON record per line; every other process turns its console off.

**Stray output is wrapped.** Anything written past Logger, a crash stack included, becomes a `raw=true` record, so the stream stays valid JSON.

**Order by `seq`, not `at`.** `at` comes from several processes' clocks; `seq` is the hub's arrival order.

- AKAN_LOG_FORMAT (text | ndjson | ndjson-only, default text): `ndjson`: one JSON record per stdout line. `ndjson-only` writes the rotating file as JSON too.

- AKAN_LOG_STREAM (1, default off): Keeps a child's IPC forwarder on instead of following the hub's floor.

- AKAN_LOG_BUFFER (number, default 2000): Records the hub owner's ring holds. Eviction starts at this or at the byte cap.

- AKAN_LOG_BUFFER_MB (number, default 4): Byte cap on the same ring. Ignored unless it is a positive number.

**`AKAN_LOG_FORMAT` is one value for the whole deployment.** Processes given different values corrupt the stream.

A docker-compose service that ships ndjson looks like this:

**`AKAN_LOG_TO_FILE: "0"` is already the image default.** The writable layer is ephemeral, and files under ndjson drop the hub floor to trace, so every child forwards everything over IPC.

**`AKAN_LOG_STDOUT_LEVEL: info`** because kubelet rotates container logs by size, and trace volume can rotate lines away before the agent reads them.

**`json-file` never rotates unless told to.** Set `max-size` and `max-file`, or switch the driver to a collector.

On Kubernetes, a node agent such as Fluent Bit strips the CRI wrapper and parses the JSON:

**Keep traceId and userId as JSON fields, not Loki labels.** Labels must stay low-cardinality (app, env, role, level); pick ids at query time with `{app="myapp"} | json | traceId="0af7651916cd43dd8448eb211c80319c"`.

Export: OpenTelemetry

Set an OTLP endpoint and every process sends its spans, and its log lines once you ask for them, to an OpenTelemetry collector over OTLP/HTTP with JSON bodies. It needs no package. With no endpoint set, nothing is created, and a request pays one branch.

- OTEL_EXPORTER_OTLP_ENDPOINT (URL, default unset): The collector's OTLP/HTTP base, such as `http://otel-collector:4318`; `/v1/traces` is appended, and `/v1/logs` once `OTEL_LOGS_EXPORTER=otlp` asks for logs. Unset, along with the two below, means no export.

- OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (URL, default unset): The full URL for spans, used as given. Set alone, only spans are exported.

- OTEL_EXPORTER_OTLP_LOGS_ENDPOINT (URL, default unset): The full URL for log records. Set alone, only logs are exported.

- OTEL_EXPORTER_OTLP_HEADERS (name=value,…, default unset): Headers on every export request, percent-encoded; `_TRACES_` and `_LOGS_` forms add to it. The values are credentials and are never logged; a malformed list is ignored with a warning that names only the variable.

- OTEL_SERVICE_NAME (string, default AKAN_PUBLIC_APP_NAME): `service.name`. Else `service.name` in `OTEL_RESOURCE_ATTRIBUTES`, else the app name.

- OTEL_RESOURCE_ATTRIBUTES (key=value,…, default unset): Extra resource attributes. Akan adds `akan.process.role`, `akan.replica.index`, `service.version` from `AKAN_BUILD_ID`, `deployment.environment.name`, `host.name` and `process.pid`.

- OTEL_TRACES_SAMPLER (always_on | always_off | traceidratio | parentbased_…, default parentbased_always_on): The head sampler. Any other value is logged once and exports no spans.

- OTEL_TRACES_SAMPLER_ARG (0 – 1, default 1.0): The ratio for `traceidratio`, read from the trace id, so every process agrees on it.

- OTEL_LOGS_EXPORTER (otlp | none, default unset): Logs go only with `otlp` here or `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` set; unlike the OpenTelemetry default, the generic endpoint alone sends spans only, since a line's text is sent as written. `none` keeps them home. `OTEL_TRACES_EXPORTER=none` turns spans off.

- OTEL_EXPORTER_OTLP_PROTOCOL (http/json, default http/json): `http/protobuf` still sends JSON, with a warning; `grpc` exports nothing.

- OTEL_EXPORTER_OTLP_TIMEOUT (ms, default 10000): One export request, retries included; `_TRACES_` and `_LOGS_` forms override it.

- OTEL_BSP_* / OTEL_BLRP_* (number, default 2048 · 512 · 5000 / 1000): `MAX_QUEUE_SIZE`, `MAX_EXPORT_BATCH_SIZE` and `SCHEDULE_DELAY` (ms) for spans and for logs.

- OTEL_SDK_DISABLED (true, default off): Turns all of it off, whatever else is set.

What each process sends

Role

- gateway: One server span per proxied request, named by its method (`GET`) because the gateway does not match routes, and its own log lines.

- all, federation, batch: A server span named after the route pattern it matched, a span per endpoint call such as `query:getUser`, a client span per database call, and its log lines. Each stage of a call (guards, handler, serialize) is a span of its own only under `AKAN_TRACE=1` or a passed `x-akan-debug`. A job is a trace of its own, linked to the one that enqueued it.

- rsc-worker: The page render span, a child of its replica's server span, and its own log lines. It flushes on SIGTERM and when its replica goes away.

**Sampling is decided once, at the first hop.** The process a request reaches first over TCP — the gateway, or a replica running without one — decides, and the sampled flag of `traceparent` carries the decision to the replica and on to the RSC worker. A caller's `traceparent` counts only when `AKAN_TRACE_ADOPT` trusts the sender; a `parentbased_` sampler then follows its flag. An untrusted caller's trace is linked from the first span, with its span id when a `traceparent` named one; an `x-request-id` names none, so it goes as the `akan.trace.link` attribute.

**`AKAN_TRACE` and `x-akan-debug` are separate switches.** `AKAN_TRACE=1` records spans for every call into this app's own metrics and request line. The exporter records a sampled call's own span and its database spans and sends them out, without joining that aggregate; the per-stage spans come only with `AKAN_TRACE=1`. `x-akan-debug` lowers one request to trace and answers with `Server-Timing`; it does not change the sampling decision. Any of the three works without the others.

**What stays out.** Span attributes carry the method, the route pattern, the status and the error type: never a URL with its query, a header value, SQL text or the caller's user id. A failure's exception event carries its error code, not its message, which may quote user input.

**Log records are opt-in.** A record carries the line's message as its body, its severity, its attrs, the logger's name and context, the endpoint and origin, a link it was handed, and its trace and span id when written inside a request. Attrs naming a secret are `[redacted]` when the record is made, before any sink sees them; nothing else is. The message text, and an error's message and stack where the line carries them, go as written, on this sink as on every other. The floor is the console level the process booted with.

**Never in a request's way.** Spans and records go into a bounded queue that sends a batch when it holds 512, once the call that filled it has returned, or on a timer, with at most two requests in flight. A full queue drops its oldest item and counts it. 429, 502, 503, 504 and an unreachable collector are retried with backoff until the timeout; any other status drops the batch. A failing collector is reported at most once a minute, by host only. The exporter's own requests are not traced, and its own warnings are not exported.

**On the way out,** each process sends what is queued once, without retries, for at most 1.5 s, and a replica under the gateway takes less once its shutdown has used up the gateway's wait. Whatever is unsent by then is dropped and counted in a last warning. An RSC worker still running 3 s after it was stopped, as one stuck in a render, is killed.

**What it costs** is the sampled share. On `apps/minimal` behind a gateway with one replica, at 16 concurrent clients on a laptop, three 8 s runs each, an endpoint that only returns a constant served a median 38.3k requests a second with export off (36.6k to 38.5k over six runs), 38.1k at a ratio of 0.01 (37.8k to 38.4k) and 28.9k at 1.0 (28.7k to 29.4k), with p50 going from 0.40 to 0.40 to 0.47 ms. A page replayed from the render cache went from 14.4k a second (14.2k to 14.6k) to 14.6k at 0.01 and 13.1k at 1.0 (13.0k to 13.3k), p50 1.02 to 1.01 to 1.12 ms. A ratio of 0.01 is therefore within noise, and 1.0 costs about a quarter of this endpoint's throughput and under a tenth of a cached page's; a page that renders spends far more per request than the export does.

**JSON bodies only.** A collector that accepts only protobuf will not work; the OpenTelemetry Collector's `otlp` receiver accepts both. Bodies are not compressed.

The SSE Stream

Live viewing is a session tool. `GET /_akan/app/logs` streams the hub as `text/event-stream` to a bearer token, with the same filters as `akan logs`:

Reconnect where you left off; an evicted range arrives as an explicit gap event

Piece

- AKAN_LOG_STREAM_TOKEN: Unset, the route does not exist: absent, not a 403. Whitespace inside the value does the same, with an error at boot.

- Authorization: Bearer: A missing or wrong token is answered with 401, and so is a header that is not `Bearer <one token>`.

- ?level=&endpoint=…: The `akan logs` filters, plus `name`, `stream` and `limit`.

- id, Last-Event-ID: Each event's id is the hub seq, so a reconnect resumes where it left off.

- : heartbeat: A heartbeat comment every 15 seconds, and a 2-second reconnect hint.

- dropped: A client that stops reading holds at most 4MB of live records, on top of a resume's replay; what it missed arrives as one dropped event with a count when it reads again, and past 10,000 missed records the stream is closed.

Gaps are explicit

A resume never skips silently. When it cannot deliver everything after `Last-Event-ID`, it sends a `gap` event first:

reason

- ring-buffer-evicted: The ring already dropped part of the range. The event carries from, to and missed.

- sequence-reset: The id is past the current seq, so a restarted process is answering.

**Only the hub owner serves it:** the gateway, or a solo replica. A child behind a gateway does not, so a token alone never reaches one.

**It is not the collection path.** A subscription loses a pod restart's whole gap and needs a route to every pod. Watch one process with it; ship what must be kept through stdout and the node agent.

Operational Checklist

Five rules that keep production logs useful and affordable.

**Keep terminal logs readable.** Use `AKAN_PUBLIC_LOG_LEVEL=info` or `warn` in production, and raise it only for a live debugging session.

**Give every sink a floor.** Pass `minLevel` to `Logger.addSink`; a sink without one follows `AKAN_LOG_FILE_LEVEL`, which is trace.

**Never log per delivered record.** Anything that delivers records (a forwarder, a sink, the stream route) must not log per item, or it feeds on its own output.

**Plan disk usage.** `AKAN_LOG_MAX_SIZE_MB` and `AKAN_LOG_MAX_FILES` apply per process key, so replicas multiply the maximum.

**Keep secrets out of messages.** Redaction covers only attrs keys that name a secret. A token interpolated into the text is not redacted, and file logs outlive the terminal.

Related pages

- Health And Metrics — Read process health and request metrics next to the logs.

- Server Console — Where .tail and .trace run against a live server.

- Docker — The container env the generated image sets, logging included.

- Kubernetes — Deploying the app image to a Kubernetes cluster.

## Code Examples

### apps/myapp/lib/invoice/invoice.service.ts

```ts
import { BillingApi } from "@apps/myapp/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";

export class InvoiceService extends serve(db.invoice, ({ plug }) => ({
  billingApi: plug(BillingApi),
})) {
  async syncInvoice(invoiceId: string) {
    this.logger.debug(`sync start invoiceId=${invoiceId}`, "invoice-sync");
    const pushed = await this.billingApi.pushInvoice(invoiceId);
    if (!pushed) {
      this.logger.warn(`sync skipped invoiceId=${invoiceId}`, "invoice-sync");
      return false;
    }
    this.logger.info(`sync complete invoiceId=${invoiceId}`, "invoice-sync");
    return true;
  }
}
```

### apps/myapp/lib/invoice/invoice.service.ts

```ts
import { Logger } from "akanjs/common";

Logger.emit({
  level: "info",
  name: "InvoiceService",
  message: "invoice pushed",
  attrs: { invoiceId, vendor: "stripe", ms: elapsed },
});
```

### local/apps/myapp/runtime/logs

```markdown
myapp-local-local-2026-05-25-gateway-0001.log
myapp-local-local-2026-05-25-0-all-0001.log
myapp-local-local-2026-05-25-1-federation-0001.log
```

### Terminal

```bash
# List current log files
ls -lh local/apps/myapp/runtime/logs

# Follow the gateway
tail -f local/apps/myapp/runtime/logs/*-gateway-*.log

# Follow one child replica
tail -f local/apps/myapp/runtime/logs/*-0-all-*.log

# Search for errors
rg "ERROR|Unhandled|Failed" local/apps/myapp/runtime/logs

# On a server with AKAN_LOG_DIR=/var/log/akan
ls -lh /var/log/akan
rg "invoice-sync|ERROR" /var/log/akan
```

### Terminal

```bash
# warn and above from any mutation, whose message mentions payment
akan logs myapp --level warn --grep payment --endpoint "mutation:*"

# One request, start to finish
akan logs myapp --trace m8x1k2-a9f3c1

# What the RSC worker rendered, with the last 50 buffered records first
akan logs myapp --role rsc-worker --origin page --replay 50

# History only, as NDJSON
akan logs myapp --since 5m --follow false --json

# In dev, what browser and native-shell pages threw
akan logs myapp --grep "Uncaught error"

# The same filters inside akan console
akan:myapp> .tail level=warn grep=payment endpoint=mutation:*
akan:myapp> .trace m8x1k2-a9f3c1
akan:myapp> .tail off
```

### Terminal

```bash
curl -X POST -H "x-akan-debug: <secret>" \
     https://api.example.com/api/refundPayment/ord_1
# that request alone is logged at trace, its lines marked debug=true
# Server-Timing: total;dur=12.4, guards;dur=0.3, handler;dur=11.2, db;desc="order.findOne";dur=9.8
```

### docker-compose.yml

```yaml
services:
  app:
    environment:
      AKAN_LOG_FORMAT: ndjson
      AKAN_LOG_TO_FILE: "0"
      AKAN_LOG_STDOUT_LEVEL: info
    logging:
      driver: json-file
      options: { max-size: "50m", max-file: "5" }
```

### fluent-bit.conf

```yaml
[INPUT]
    name              tail
    path              /var/log/containers/*.log
    multiline.parser  cri
[FILTER]
    name          parser
    match         *
    key_name      log
    parser        json
    reserve_data  true
```

### docker-compose.yml

```yaml
services:
  app:
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
      OTEL_EXPORTER_OTLP_HEADERS: authorization=Bearer%20<token>
      OTEL_LOGS_EXPORTER: otlp
      OTEL_TRACES_SAMPLER: parentbased_traceidratio
      OTEL_TRACES_SAMPLER_ARG: "0.05"
```

### Terminal

```bash
curl -N -H "Authorization: Bearer $AKAN_LOG_STREAM_TOKEN" \
     "http://<pod>:8282/_akan/app/logs?level=warn&endpoint=mutation:*"

# Reconnect where you left off; an evicted range arrives as an explicit gap event
curl -N -H "Authorization: Bearer $AKAN_LOG_STREAM_TOKEN" \
     -H "Last-Event-ID: 84213" \
     "http://<pod>:8282/_akan/app/logs?level=warn"
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

