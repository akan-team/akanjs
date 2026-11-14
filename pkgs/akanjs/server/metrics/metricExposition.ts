import type { AkanMetricFamily } from "akanjs/service";

export type ExpositionFormat = "openmetrics" | "prometheus";

const MEDIA_FORMATS: Readonly<Record<string, ExpositionFormat | "json">> = {
  "application/openmetrics-text": "openmetrics",
  "text/plain": "prometheus",
  "application/json": "json",
  "application/*": "json",
  "*/*": "json",
};

const CONTENT_TYPES: Readonly<Record<ExpositionFormat, string>> = {
  openmetrics: "application/openmetrics-text; version=1.0.0; charset=utf-8",
  prometheus: "text/plain; version=0.0.4; charset=utf-8",
};

const numberOf = (value: number) => {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "+Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  return String(value);
};

//? A bound written as Go's client writes it ("1.0", not "1"), so one bucket keeps one `le` whichever format scraped it.
const boundOf = (bound: number) => (Number.isInteger(bound) ? `${bound}.0` : numberOf(bound));

const labelValueOf = (value: string) => value.replace(/[\\"\n]/g, (char) => (char === "\n" ? "\\n" : `\\${char}`));

const labelsOf = (labels: Record<string, string>, extra?: readonly [string, string]) => {
  const pairs = Object.entries(labels).map(([name, value]) => `${name}="${labelValueOf(value)}"`);
  if (extra) pairs.push(`${extra[0]}="${labelValueOf(extra[1])}"`);
  return pairs.length ? `{${pairs.join(",")}}` : "";
};

export class MetricExposition {
  //? An Accept with no listed format, `*/*` (fetch's default) among them, keeps the JSON every earlier reader parses.
  static negotiate(accept: string | null): ExpositionFormat | null {
    let best: { format: ExpositionFormat | "json"; q: number } | null = null;
    for (const range of (accept ?? "").split(",")) {
      const [type = "", ...params] = range.split(";").map((part) => part.trim().toLowerCase());
      const format = MEDIA_FORMATS[type];
      if (!format) continue;
      const qParam = params.find((param) => param.startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      if (!(q > 0) || (best && q <= best.q)) continue;
      best = { format, q };
    }
    return best && best.format !== "json" ? best.format : null;
  }

  static contentType(format: ExpositionFormat): string {
    return CONTENT_TYPES[format];
  }

  static render(families: readonly AkanMetricFamily[], format: ExpositionFormat): string {
    const lines: string[] = [];
    const seen = new Set<string>();
    for (const family of families) {
      if (seen.has(family.name)) continue;
      seen.add(family.name);
      MetricExposition.#renderFamily(lines, family, format);
    }
    if (format === "openmetrics") lines.push("# EOF");
    return `${lines.join("\n")}\n`;
  }

  //? OpenMetrics names a counter family without the `_total` its samples carry, and escapes `"` in HELP; the 0.0.4 text
  //? keeps `_total` on both and would read `\"` in HELP as two characters.
  static #renderFamily(lines: string[], family: AkanMetricFamily, format: ExpositionFormat) {
    const familyName =
      format === "openmetrics" && family.type === "counter" ? family.name.replace(/_total$/, "") : family.name;
    const help = family.help.replace(format === "openmetrics" ? /[\\"\n]/g : /[\\\n]/g, (char) =>
      char === "\n" ? "\\n" : `\\${char}`,
    );
    lines.push(`# HELP ${familyName} ${help}`, `# TYPE ${familyName} ${family.type}`);
    if (family.type !== "histogram") {
      for (const sample of family.samples)
        lines.push(`${family.name}${labelsOf(sample.labels)} ${numberOf(sample.value)}`);
      return;
    }
    for (const sample of family.samples) {
      let cumulative = 0;
      family.buckets.forEach((bound, idx) => {
        cumulative += sample.counts[idx] ?? 0;
        lines.push(`${family.name}_bucket${labelsOf(sample.labels, ["le", boundOf(bound)])} ${cumulative}`);
      });
      lines.push(
        `${family.name}_bucket${labelsOf(sample.labels, ["le", "+Inf"])} ${sample.count}`,
        `${family.name}_sum${labelsOf(sample.labels)} ${numberOf(sample.sum)}`,
        `${family.name}_count${labelsOf(sample.labels)} ${sample.count}`,
      );
    }
  }
}
