// Kept free of akanjs/base: the RSC client and the request store both bundle this file.

export interface CookieRead {
  value?: string;
  count: number;
}

export interface CookieEntry {
  name: string;
  value: string;
}

interface CookieSegment extends CookieEntry {
  raw: string;
}

// Browsers send every matching cookie with no sign of which write it was, so `read` answers a once-sent name only.
export class CookieJar {
  readonly #segments: readonly CookieSegment[];

  private constructor(segments: readonly CookieSegment[]) {
    this.#segments = segments;
  }

  static parse(header: string | null | undefined): CookieJar {
    const segments: CookieSegment[] = [];
    for (const part of header?.split(";") ?? []) {
      const raw = part.trim();
      const eq = raw.indexOf("=");
      if (eq === -1) continue;
      segments.push({ name: raw.slice(0, eq).trim(), value: CookieJar.#decode(raw.slice(eq + 1).trim()), raw });
    }
    return new CookieJar(segments);
  }

  static #decode(text: string): string {
    const unquoted = text.length >= 2 && text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    try {
      return decodeURIComponent(unquoted);
    } catch {
      return unquoted;
    }
  }

  all(name: string): string[] {
    return this.#segments.filter((segment) => segment.name === name).map((segment) => segment.value);
  }

  read(name: string): CookieRead {
    const values = this.all(name);
    return values.length === 1 ? { value: values[0], count: 1 } : { count: values.length };
  }

  has(name: string): boolean {
    return this.#segments.some((segment) => segment.name === name);
  }

  names(): string[] {
    return [...new Set(this.#segments.map((segment) => segment.name))];
  }

  entries(): CookieEntry[] {
    return this.#segments.map(({ name, value }) => ({ name, value }));
  }

  //? The `j:<json>` form is what Express writes for an object value.
  readJson(name: string): unknown {
    const { value } = this.read(name);
    if (!value?.startsWith("j:")) return value;
    try {
      return JSON.parse(value.slice(2)) as unknown;
    } catch {
      return value;
    }
  }

  toMap(): Map<string, CookieEntry> {
    const counts = new Map<string, number>();
    for (const { name } of this.#segments) counts.set(name, (counts.get(name) ?? 0) + 1);
    const map = new Map<string, CookieEntry>();
    for (const { name, value } of this.#segments) if (counts.get(name) === 1) map.set(name, { name, value });
    return map;
  }

  without(drop: (name: string) => boolean): CookieJar {
    return new CookieJar(this.#segments.filter((segment) => !drop(segment.name)));
  }

  toHeader(): string {
    return this.#segments.map((segment) => segment.raw).join("; ");
  }
}
