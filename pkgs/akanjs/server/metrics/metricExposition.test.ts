import { describe, expect, test } from "bun:test";
import type { AkanMetricFamily } from "akanjs/service";
import { MetricExposition } from "./metricExposition";

const families: AkanMetricFamily[] = [
  {
    name: "akan_endpoint_requests_total",
    help: 'Calls answered, "by status" \\ class.',
    type: "counter",
    samples: [
      { labels: { role: "all", endpoint: "query:getTitle", status_class: "2xx" }, value: 3 },
      { labels: { role: "all", endpoint: 'odd"\\\nname', status_class: "5xx" }, value: 1 },
    ],
  },
  {
    name: "akan_rsc_renders_pending",
    help: "Renders waiting.\nOne line.",
    type: "gauge",
    samples: [{ labels: {}, value: 2 }],
  },
  {
    name: "akan_endpoint_request_duration_seconds",
    help: "Call time.",
    type: "histogram",
    buckets: [0.005, 1, 10],
    samples: [{ labels: { endpoint: "query:getTitle" }, counts: [1, 2, 0, 1], sum: 12.5, count: 4 }],
  },
];

describe("MetricExposition", () => {
  test("renders OpenMetrics text: counter families without _total, cumulative buckets to +Inf, and a closing # EOF", () => {
    expect(MetricExposition.render(families, "openmetrics")).toBe(
      [
        '# HELP akan_endpoint_requests Calls answered, \\"by status\\" \\\\ class.',
        "# TYPE akan_endpoint_requests counter",
        'akan_endpoint_requests_total{role="all",endpoint="query:getTitle",status_class="2xx"} 3',
        'akan_endpoint_requests_total{role="all",endpoint="odd\\"\\\\\\nname",status_class="5xx"} 1',
        "# HELP akan_rsc_renders_pending Renders waiting.\\nOne line.",
        "# TYPE akan_rsc_renders_pending gauge",
        "akan_rsc_renders_pending 2",
        "# HELP akan_endpoint_request_duration_seconds Call time.",
        "# TYPE akan_endpoint_request_duration_seconds histogram",
        'akan_endpoint_request_duration_seconds_bucket{endpoint="query:getTitle",le="0.005"} 1',
        'akan_endpoint_request_duration_seconds_bucket{endpoint="query:getTitle",le="1.0"} 3',
        'akan_endpoint_request_duration_seconds_bucket{endpoint="query:getTitle",le="10.0"} 3',
        'akan_endpoint_request_duration_seconds_bucket{endpoint="query:getTitle",le="+Inf"} 4',
        'akan_endpoint_request_duration_seconds_sum{endpoint="query:getTitle"} 12.5',
        'akan_endpoint_request_duration_seconds_count{endpoint="query:getTitle"} 4',
        "# EOF",
        "",
      ].join("\n"),
    );
  });

  test("renders the Prometheus 0.0.4 text with _total on the family, HELP quotes as they are, and no # EOF", () => {
    const text = MetricExposition.render(families, "prometheus");
    expect(text.split("\n").slice(0, 2)).toEqual([
      '# HELP akan_endpoint_requests_total Calls answered, "by status" \\\\ class.',
      "# TYPE akan_endpoint_requests_total counter",
    ]);
    expect(text).toContain('akan_endpoint_request_duration_seconds_bucket{endpoint="query:getTitle",le="+Inf"} 4\n');
    expect(text.endsWith('akan_endpoint_request_duration_seconds_count{endpoint="query:getTitle"} 4\n')).toBe(true);
    expect(text).not.toContain("# EOF");
  });

  test("answers a scraper that asks for text with it, and keeps the JSON for every other Accept", () => {
    const prometheus2 =
      "application/openmetrics-text;version=1.0.0,application/openmetrics-text;version=0.0.1;q=0.75,text/plain;version=0.0.4;q=0.5,*/*;q=0.1";
    const prometheus3 =
      "application/openmetrics-text;version=1.0.0;escaping=allow-utf-8;q=0.6,application/openmetrics-text;version=0.0.1;q=0.5,text/plain;version=1.0.0;escaping=allow-utf-8;q=0.4,text/plain;version=0.0.4;q=0.3,*/*;q=0.2";
    const negotiated = (accept: string | null) => MetricExposition.negotiate(accept);

    expect(negotiated(prometheus2)).toBe("openmetrics");
    expect(negotiated(prometheus3)).toBe("openmetrics");
    expect(negotiated("text/plain")).toBe("prometheus");
    expect(negotiated("application/json;q=0.5, text/plain;q=0.9")).toBe("prometheus");
    expect(negotiated("application/json, text/plain, */*")).toBeNull();
    expect(negotiated("*/*")).toBeNull();
    expect(negotiated("text/html,application/xhtml+xml,*/*;q=0.8")).toBeNull();
    expect(negotiated("application/openmetrics-text;q=0")).toBeNull();
    expect(negotiated(null)).toBeNull();
  });
});
