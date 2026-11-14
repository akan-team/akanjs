import { SignalFailure } from "../../signal/SignalFailure";
import {
  type Counter,
  type CounterSeries,
  type Histogram,
  type HistogramSeries,
  LabelValues,
  metricRegistry,
} from "./metricRegistry";

export const UNMATCHED_ROUTE = "unmatched";

const STATUS_CLASSES = ["1xx", "2xx", "3xx", "4xx", "5xx"] as const;

export class RequestSeries {
  readonly #counter: Counter;
  readonly #histogram: Histogram;
  readonly #labels: Record<string, string>;
  readonly #classes: (CounterSeries | undefined)[] = [undefined, undefined, undefined, undefined, undefined];
  #latency: HistogramSeries | undefined;

  constructor(counter: Counter, histogram: Histogram, labels: Record<string, string>) {
    this.#counter = counter;
    this.#histogram = histogram;
    this.#labels = labels;
  }

  observe(status: number, elapsedMs: number) {
    const idx = Math.min(4, Math.max(0, Math.floor(status / 100) - 1));
    this.#classes[idx] ??= this.#counter.series({ ...this.#labels, status_class: STATUS_CLASSES[idx] });
    this.#classes[idx].inc();
    this.#latency ??= this.#histogram.series(this.#labels);
    this.#latency.observe(elapsedMs / 1000);
  }

  tracked<Args extends unknown[], T>(handler: (...args: Args) => Promise<T>): (...args: Args) => Promise<T> {
    return async (...args) => await this.track(() => handler(...args));
  }

  async track<T>(call: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await call();
      this.observe(200, performance.now() - startedAt);
      return result;
    } catch (error) {
      this.observe(SignalFailure.statusOf(error), performance.now() - startedAt);
      throw error;
    }
  }
}

class RequestSeriesSet {
  readonly #counter: Counter;
  readonly #histogram: Histogram;
  readonly #labelName: string;
  readonly #values = new LabelValues();
  readonly #series = new Map<string, RequestSeries>();

  constructor(counter: Counter, histogram: Histogram, labelName: string) {
    this.#counter = counter;
    this.#histogram = histogram;
    this.#labelName = labelName;
  }

  of(name: string): RequestSeries {
    const value = this.#values.admit(name);
    const existing = this.#series.get(value);
    if (existing) return existing;
    const series = new RequestSeries(this.#counter, this.#histogram, { [this.#labelName]: value });
    this.#series.set(value, series);
    return series;
  }
}

export const endpointRequests = new RequestSeriesSet(
  metricRegistry.counter(
    "akan_endpoint_requests_total",
    "Endpoint calls answered, over HTTP, websocket or MCP, by status class.",
    ["endpoint", "status_class"],
  ),
  metricRegistry.histogram("akan_endpoint_request_duration_seconds", "Time an endpoint call took to answer.", [
    "endpoint",
  ]),
  "endpoint",
);

export const pageRequests = new RequestSeriesSet(
  metricRegistry.counter(
    "akan_page_requests_total",
    "Page documents, a `?csr=true` shell included, and RSC payloads answered, by route and status class.",
    ["route", "status_class"],
  ),
  metricRegistry.histogram(
    "akan_page_request_duration_seconds",
    "Time a page took to start its response, which may stream on.",
    ["route"],
  ),
  "route",
);

export class PageCall {
  route = UNMATCHED_ROUTE;
  readonly #startedAt = performance.now();

  finish(response: Response): Response {
    pageRequests.of(this.route).observe(response.status, performance.now() - this.#startedAt);
    return response;
  }
}
