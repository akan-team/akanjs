import path from "node:path";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface Placement {
  column: number;
  trailing: number;
}

//* Prints what `biome format` would, or `akan lint` and `akan sync` flip-flop a generated .json. Biome keeps a
//* package.json fully expanded (`expand: always`); elsewhere (`auto`) it keeps an object expanded, collapses an array
//* that fits the 120-column line (a trailing comma included), fills an array of numbers, and ends with a newline.
export class JsonFormatter {
  static readonly lineWidth = 120;

  static stringify(value: unknown, filePath: string) {
    const json = JSON.stringify(value, null, 2);
    if (path.basename(filePath) === "package.json") return `${json}\n`;
    return `${JsonFormatter.#print(JSON.parse(json) as JsonValue, 0, { column: 0, trailing: 0 })}\n`;
  }

  static #print(value: JsonValue, depth: number, placement: Placement): string {
    if (Array.isArray(value)) return JsonFormatter.#printArray(value, depth, placement);
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    const indent = "  ".repeat(depth + 1);
    const members = entries.map(([key, member], idx) => {
      const prefix = `${indent}${JSON.stringify(key)}: `;
      const trailing = idx < entries.length - 1 ? 1 : 0;
      return `${prefix}${JsonFormatter.#print(member, depth + 1, { column: Bun.stringWidth(prefix), trailing })}`;
    });
    return `{\n${members.join(",\n")}\n${"  ".repeat(depth)}}`;
  }

  static #printArray(items: JsonValue[], depth: number, { column, trailing }: Placement) {
    if (!items.length) return "[]";
    const flat = JsonFormatter.#flat(items);
    if (flat !== null && column + Bun.stringWidth(flat) + trailing <= JsonFormatter.lineWidth) return flat;
    const indent = "  ".repeat(depth + 1);
    const isLast = (idx: number) => idx === items.length - 1;
    const body = items.every((item) => typeof item === "number")
      ? JsonFormatter.#fill(
          items.map((item, idx) => `${JSON.stringify(item)}${isLast(idx) ? "" : ","}`),
          indent,
        )
      : items
          .map((item, idx) => {
            const placement = { column: indent.length, trailing: isLast(idx) ? 0 : 1 };
            return `${indent}${JsonFormatter.#print(item, depth + 1, placement)}`;
          })
          .join(",\n");
    return `[\n${body}\n${"  ".repeat(depth)}]`;
  }

  static #fill(tokens: string[], indent: string) {
    const lines: string[] = [];
    let line = "";
    for (const token of tokens) {
      if (line && Bun.stringWidth(line) + 1 + Bun.stringWidth(token) <= JsonFormatter.lineWidth) {
        line = `${line} ${token}`;
        continue;
      }
      if (line) lines.push(line);
      line = `${indent}${token}`;
    }
    return [...lines, line].join("\n");
  }

  static #flat(value: JsonValue): string | null {
    if (Array.isArray(value)) {
      const items = value.map((item) => JsonFormatter.#flat(item));
      return items.includes(null) ? null : `[${items.join(", ")}]`;
    }
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    return Object.keys(value).length ? null : "{}";
  }
}
