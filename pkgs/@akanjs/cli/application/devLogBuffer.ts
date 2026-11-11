import { stripAnsi } from "@akanjs/devkit/stripAnsi";

export interface DevLogLine {
  seq: number;
  app: string;
  /** Which process inside the app wrote it: `host`, or `#<idx> <role>` for a forwarded replica. */
  source: string;
  kind: "stdout" | "stderr";
  text: string;
}

/** `null` on either field widens to every app / every source within the app. */
export interface DevLogTarget {
  app?: string | null;
  source?: string | null;
}

export interface DevLogQuery extends DevLogTarget {
  grep?: string;
  errorsOnly?: boolean;
}

// The app name is prefixed only when apps are merged: within one app the replica tag is already in the text.
export const plainTextOf = (lines: DevLogLine[], { withApp = false }: { withApp?: boolean } = {}): string => {
  const width = withApp ? lines.reduce((max, line) => Math.max(max, line.app.length), 0) : 0;
  return lines.map((line) => `${withApp ? `${line.app.padEnd(width)} │ ` : ""}${stripAnsi(line.text)}`).join("\n");
};

// `GatewayLogging.writeChildLine` prefixes each forwarded replica line with `[child:<idx> <role>] [<stream>] `;
// anything else is the host process's own stdio (dev host, gateway, RSC worker).
export const HOST_SOURCE = "host";
const childPrefix = /^\[child:(\d+) ([a-z-]+)\] \[(?:stdout|stderr)\] /;
export const sourceOf = (text: string): string => {
  const match = childPrefix.exec(text);
  return match ? `#${match[1]} ${match[2]}` : HOST_SOURCE;
};

// Stored verbatim, ANSI (the level colour) included; only matching strips it, so a grep ignores escapes.
export class DevLogBuffer {
  static readonly defaultLimit = 5_000;

  readonly #limit: number;
  readonly #lines: DevLogLine[] = [];
  readonly #partial = new Map<string, string>();
  /** Insertion-ordered per app, so the rail lists replicas in the order they first spoke. */
  readonly #sources = new Map<string, Set<string>>();
  #seq = 0;

  constructor({ limit = DevLogBuffer.defaultLimit }: { limit?: number } = {}) {
    this.#limit = Math.max(1, limit);
  }

  get size() {
    return this.#lines.length;
  }

  sourcesOf(app: string): string[] {
    return [...(this.#sources.get(app) ?? [])];
  }

  push(app: string, kind: "stdout" | "stderr", chunk: string): DevLogLine[] {
    const key = `${app}:${kind}`;
    const parts = `${this.#partial.get(key) ?? ""}${chunk}`.split("\n");
    this.#partial.set(key, parts.pop() ?? "");
    return this.#append(app, kind, parts);
  }

  /** Called when a child's stream ends, so a last line with no trailing newline is not swallowed. */
  flushPartials(): DevLogLine[] {
    const flushed: DevLogLine[] = [];
    for (const [key, remainder] of [...this.#partial]) {
      this.#partial.set(key, "");
      if (!remainder) continue;
      const split = key.lastIndexOf(":");
      const app = key.slice(0, split);
      const kind = key.slice(split + 1) === "stderr" ? "stderr" : "stdout";
      flushed.push(...this.#append(app, kind, [remainder]));
    }
    return flushed;
  }

  select({ app = null, source = null, grep, errorsOnly = false }: DevLogQuery = {}): DevLogLine[] {
    const needle = grep?.trim().toLowerCase();
    return this.#lines.filter((line) => {
      if (app !== null && line.app !== app) return false;
      if (source !== null && line.source !== source) return false;
      if (errorsOnly && line.kind !== "stderr") return false;
      if (needle && !stripAnsi(line.text).toLowerCase().includes(needle)) return false;
      return true;
    });
  }

  clear(app: string | null = null) {
    const kept = app === null ? [] : this.#lines.filter((line) => line.app !== app);
    this.#lines.length = 0;
    this.#lines.push(...kept);
  }

  #append(app: string, kind: "stdout" | "stderr", texts: string[]): DevLogLine[] {
    const known = this.#sources.get(app) ?? new Set<string>();
    this.#sources.set(app, known);
    const added = texts.map((text) => {
      const source = sourceOf(text);
      known.add(source);
      return { seq: ++this.#seq, app, source, kind, text };
    });
    this.#lines.push(...added);
    if (this.#lines.length > this.#limit) this.#lines.splice(0, this.#lines.length - this.#limit);
    return added;
  }
}
