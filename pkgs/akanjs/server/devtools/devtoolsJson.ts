import { dayjs } from "akanjs/base";
import type { Unserializable } from "./types";

/**
 * Coerces arbitrary registry values into something `JSON.stringify` can round-trip.
 *
 * Registries hold whatever a `.constant.ts` happened to export — Dayjs defaults, Maps, Sets, classes,
 * closures, even cyclic graphs. The devtools payloads must never throw on one of those, so anything
 * unrepresentable degrades to an `Unserializable` marker the visualiser can render as-is.
 */
export class DevtoolsJson {
  static readonly #defaultMaxDepth = 6;

  static toSafe(value: unknown, { maxDepth = DevtoolsJson.#defaultMaxDepth }: { maxDepth?: number } = {}): unknown {
    return DevtoolsJson.#coerce(value, maxDepth, new WeakSet<object>());
  }

  static #coerce(value: unknown, depthLeft: number, seen: WeakSet<object>): unknown {
    if (value === null || value === undefined) return null;
    const primitive = DevtoolsJson.#coercePrimitive(value);
    if (primitive !== undefined) return primitive;
    if (typeof value !== "object") return null;

    const object = value as object;
    if (seen.has(object)) return DevtoolsJson.#mark("circular");
    if (depthLeft <= 0) return DevtoolsJson.#mark("depth-limit");

    seen.add(object);
    try {
      return DevtoolsJson.#coerceObject(object, depthLeft, seen);
    } finally {
      seen.delete(object);
    }
  }

  /** Returns `undefined` when `value` is not a leaf this method owns, so the caller keeps walking. */
  static #coercePrimitive(value: unknown): unknown {
    switch (typeof value) {
      case "string":
      case "boolean":
        return value;
      case "number":
        // JSON turns NaN/Infinity into `null`, which reads as "absent" in the visualiser; keep them legible.
        return Number.isFinite(value) ? value : String(value);
      case "bigint":
        return DevtoolsJson.#mark("bigint", String(value));
      case "symbol":
        return DevtoolsJson.#mark("symbol", (value as symbol).description);
      case "function":
        return DevtoolsJson.#coerceFunction(value as (...args: never[]) => unknown);
      default:
        return undefined;
    }
  }

  static #coerceFunction(value: (...args: never[]) => unknown): Unserializable {
    const isClass = /^\s*class\s/.test(Function.prototype.toString.call(value));
    return DevtoolsJson.#mark(isClass ? "class" : "function", value.name || undefined);
  }

  static #coerceObject(value: object, depthLeft: number, seen: WeakSet<object>): unknown {
    if (dayjs.isDayjs(value)) return value.toISOString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (Array.isArray(value)) return value.map((entry) => DevtoolsJson.#coerce(entry, depthLeft - 1, seen));
    if (value instanceof Set) return [...value].map((entry) => DevtoolsJson.#coerce(entry, depthLeft - 1, seen));
    if (value instanceof Map) {
      return Object.fromEntries(
        [...value.entries()].map(([key, entry]) => [String(key), DevtoolsJson.#coerce(entry, depthLeft - 1, seen)]),
      );
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, DevtoolsJson.#coerce(entry, depthLeft - 1, seen)]),
    );
  }

  static #mark(type: Unserializable["type"], name?: string): Unserializable {
    return { __akan: "unserializable", type, ...(name ? { name } : {}) };
  }
}
