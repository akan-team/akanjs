import { Binary, dayjs, FIELD_META } from "akanjs/base";
import { plainFieldsOf } from "akanjs/common";
import type { ConstantCls, ConstantModelRef } from "akanjs/constant";

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
    const entries = Object.entries(plainFieldsOf(value)).map(
      ([key, item]) => [key, TaggedJson.toTagged(item)] as const,
    );
    const record = Object.fromEntries(entries);
    // A record holding the tag key would revive as the value it spells, so it goes out as entries, not as an object.
    const fields = tag in record ? { [tag]: "plain", entries } : record;
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
    if (kind === "plain" && Array.isArray(entries)) return Object.fromEntries(entries as [string, unknown][]);
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
    if (instances.has(value))
      return TaggedJson.#restoreRelations(new (ref as unknown as new (obj: object) => object)(value), value, ref);
    const record = value as Record<string, unknown>;
    for (const [key, field] of Object.entries(ref[FIELD_META])) {
      if (!field.isClass || !(key in record)) continue;
      record[key] = TaggedJson.#rebuild(record[key], { ref: field.modelRef, arrDepth: field.arrDepth }, instances);
    }
    return value;
  }

  //? A model's constructor reads a stored relation id as the related model's fields and loses it, so it is put back.
  static #restoreRelations(built: unknown, stored: unknown, ref: ConstantModelRef): unknown {
    if (!built || typeof built !== "object" || !stored || typeof stored !== "object") return built;
    if (Array.isArray(built)) {
      if (Array.isArray(stored))
        for (const [idx, item] of built.entries()) TaggedJson.#restoreRelations(item, stored[idx], ref);
      return built;
    }
    const builtRecord = built as Record<string, unknown>;
    const storedRecord = stored as Record<string, unknown>;
    for (const [key, field] of Object.entries(ref[FIELD_META])) {
      if (!field.isClass) continue;
      if (field.isScalar) TaggedJson.#restoreRelations(builtRecord[key], storedRecord[key], field.modelRef);
      else builtRecord[key] = storedRecord[key];
    }
    return built;
  }

  static #isModelCls(ref: unknown): ref is ConstantCls {
    return typeof ref === "function" && FIELD_META in ref;
  }
}
