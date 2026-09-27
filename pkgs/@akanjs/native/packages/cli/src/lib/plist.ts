// Minimal XML property list writer for Info.plist (macOS, iOS).

export type PlistValue = string | number | boolean | Date | PlistValue[] | { [key: string]: PlistValue | undefined };

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function write(value: PlistValue, indent: string, out: string[]): void {
  const next = `${indent}\t`;
  if (typeof value === "string") out.push(`${indent}<string>${escape(value)}</string>`);
  else if (typeof value === "boolean") out.push(`${indent}<${value}/>`);
  else if (typeof value === "number") {
    out.push(Number.isInteger(value) ? `${indent}<integer>${value}</integer>` : `${indent}<real>${value}</real>`);
  } else if (value instanceof Date) out.push(`${indent}<date>${value.toISOString().replace(/\.\d{3}Z$/, "Z")}</date>`);
  else if (Array.isArray(value)) {
    if (value.length === 0) return void out.push(`${indent}<array/>`);
    out.push(`${indent}<array>`);
    for (const item of value) write(item, next, out);
    out.push(`${indent}</array>`);
  } else {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined) as [string, PlistValue][];
    if (entries.length === 0) return void out.push(`${indent}<dict/>`);
    out.push(`${indent}<dict>`);
    for (const [key, item] of entries) {
      out.push(`${next}<key>${escape(key)}</key>`);
      write(item, next, out);
    }
    out.push(`${indent}</dict>`);
  }
}

export function toPlist(root: { [key: string]: PlistValue | undefined }): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
  ];
  write(root, "", out);
  out.push("</plist>", "");
  return out.join("\n");
}

const unescape = (text: string) =>
  text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt"
      ? "<"
      : e === "gt"
        ? ">"
        : e === "amp"
          ? "&"
          : e === "quot"
            ? '"'
            : e === "apos"
              ? "'"
              : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );

/**
 * Reads an XML property list (what `security cms -D` prints for a provisioning profile). <data> comes
 * back as its base64 text (whitespace removed), <date> as a Date.
 */
export function parsePlist(xml: string): PlistValue {
  const tokens = [
    ...xml
      .replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, "")
      .matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/)?>|([^<]+)/g),
  ];
  let i = 0;
  const next = () => tokens[i++];
  const text = (tag: string): string => {
    let out = "";
    for (;;) {
      const t = next();
      if (!t) throw new Error(`unterminated <${tag}>`);
      if (t[4] !== undefined) out += t[4];
      else if (t[1] === "/" && t[2] === tag) return unescape(out);
      else throw new Error(`unexpected <${t[1]}${t[2]}> in <${tag}>`);
    }
  };
  const value = (): PlistValue => {
    let t = next();
    while (t && t[4] !== undefined && !t[4].trim()) t = next();
    if (!t || t[1] === "/") throw new Error("expected a value");
    const tag = t[2]!;
    const empty = !!t[3];
    switch (tag) {
      case "plist": {
        const v = value();
        return v;
      }
      case "dict": {
        const out: Record<string, PlistValue> = {};
        if (empty) return out;
        for (;;) {
          let k = next();
          while (k && k[4] !== undefined && !k[4].trim()) k = next();
          if (!k) throw new Error("unterminated <dict>");
          if (k[1] === "/" && k[2] === "dict") return out;
          if (k[2] !== "key") throw new Error(`expected <key> in <dict>, got <${k[2]}>`);
          const key = text("key");
          out[key] = value();
        }
      }
      case "array": {
        const out: PlistValue[] = [];
        if (empty) return out;
        for (;;) {
          const save = i;
          let k = next();
          while (k && k[4] !== undefined && !k[4].trim()) k = next();
          if (!k) throw new Error("unterminated <array>");
          if (k[1] === "/" && k[2] === "array") return out;
          i = save;
          out.push(value());
        }
      }
      case "string":
        return empty ? "" : text("string");
      case "key":
        return text("key");
      case "integer":
        return Number(text("integer"));
      case "real":
        return Number(text("real"));
      case "true":
        return true;
      case "false":
        return false;
      case "date":
        return new Date(text("date"));
      case "data":
        return empty ? "" : text("data").replace(/\s+/g, "");
      default:
        throw new Error(`unknown plist element <${tag}>`);
    }
  };
  return value();
}
