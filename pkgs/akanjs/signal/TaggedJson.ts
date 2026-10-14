import { Binary, dayjs, FIELD_META } from "akanjs/base";
import { plainFieldsOf } from "akanjs/common";
import type { ConstantCls } from "akanjs/constant";

interface DeclaredShape {
  ref: unknown;
  arrDepth: number;
}

//* JSON that reads back what was written: plain JSON spells a Map `{}`, bytes an index map and a date a string, and
//* a model instance's `toJSON` keeps none of it, so a value read back from plain JSON is not the value stored.
export class TaggedJson {
  static readonly #tag = "\u0000akan";

  static stringify(value: unknown) {
    return JSON.stringify(TaggedJson.toTagged(value));
  }

  static toTagged(value: unknown): unknown {
    const tag = TaggedJson.#tag;
    if (value instanceof Map)
      return { [tag]: "map", entries: [...value].map(([key, item]) => [key, TaggedJson.toTagged(item)]) };
    if (ArrayBuffer.isView(value))
      return {
        [tag]: "bytes",
        base64: Binary.serializeValue(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    if (dayjs.isDayjs(value)) return { [tag]: "dayjs", iso: value.toJSON() };
    if (value instanceof Date) return { [tag]: "date", iso: value.toJSON() };
    if (Array.isArray(value)) return value.map((item) => TaggedJson.toTagged(item));
    if (!value || typeof value !== "object") return value;
    const prototype: unknown = Object.getPrototypeOf(value);
    const isPlain = prototype === null || prototype === Object.prototype;
    if (!isPlain && !TaggedJson.#isModelCls(value.constructor)) return value;
    const fields = Object.fromEntries(
      Object.entries(plainFieldsOf(value)).map(([key, item]) => [key, TaggedJson.toTagged(item)]),
    );
    return isPlain ? fields : { [tag]: "model", fields };
  }

  /** Reads `text` back, rebuilding as the shape's model every value that was a model instance when written. */
  static parse(text: string, shape: DeclaredShape) {
    const instances = new WeakSet<object>();
    const value = JSON.parse(text, (_key, item: unknown) => TaggedJson.#revive(item, instances)) as unknown;
    return TaggedJson.#rebuild(value, shape, instances);
  }

  static #revive(value: unknown, instances: WeakSet<object>) {
    if (!value || typeof value !== "object" || !(TaggedJson.#tag in value)) return value;
    const { [TaggedJson.#tag]: kind, entries, base64, iso, fields } = value as Record<string, unknown>;
    if (kind === "map" && Array.isArray(entries)) return new Map(entries as [string, unknown][]);
    if (kind === "bytes" && typeof base64 === "string") return Binary.parseValue(base64);
    if (kind === "dayjs") return dayjs(iso as string | null);
    if (kind === "date") return new Date(typeof iso === "string" ? iso : Number.NaN);
    if (kind === "model" && fields && typeof fields === "object") {
      instances.add(fields);
      return fields;
    }
    return value;
  }

  //? A model's own constructor rebuilds its nested models, so only a plain value is walked for the ones it holds.
  static #rebuild(value: unknown, { ref, arrDepth }: DeclaredShape, instances: WeakSet<object>): unknown {
    if (!value || typeof value !== "object") return value;
    if (arrDepth > 0)
      return Array.isArray(value)
        ? value.map((item) => TaggedJson.#rebuild(item, { ref, arrDepth: arrDepth - 1 }, instances))
        : value;
    if (!TaggedJson.#isModelCls(ref)) return value;
    if (instances.has(value)) return new (ref as unknown as new (obj: object) => object)(value);
    const record = value as Record<string, unknown>;
    for (const [key, field] of Object.entries(ref[FIELD_META])) {
      if (!field.isClass || !(key in record)) continue;
      record[key] = TaggedJson.#rebuild(record[key], { ref: field.modelRef, arrDepth: field.arrDepth }, instances);
    }
    return value;
  }

  static #isModelCls(ref: unknown): ref is ConstantCls {
    return typeof ref === "function" && FIELD_META in ref;
  }
}
