import {
  Any,
  type Cls,
  dayjs,
  type EnumInstance,
  FIELD_META,
  Float,
  getNonArrayModel,
  ID,
  Int,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";

import { ConstantRegistry } from "./constantRegistry";
import type { ConstantField, FieldObject } from "./fieldInfo";
import { FieldPlan, type FieldPlanEntry } from "./fieldPlan";
import { defaultPlanOf } from "./getDefault";
import { InvalidInputError } from "./invalidInputError";
import { deserialize } from "./serialize";

type ModelCls = Cls & { [FIELD_META]: FieldObject };
type Parse = (value: unknown, path: string) => unknown;

interface ParseOption {
  key: string;
  nullable?: boolean;
  enum?: EnumInstance;
}

const isString = (value: unknown) => typeof value === "string";
const isNumber = (value: unknown) => typeof value === "number";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

//? The server's half of the request schema `JsonSchemaBuilder.model` publishes: every field is checked against its
//? JSON type, its enum and whether it may be absent. Two departures keep an app built against an older schema working:
//? an unknown key is dropped rather than refused, and a field with a default may be left out.
export class InputParser {
  //? A JSON body carries its own types, so a number where a string belongs is the caller's mistake, not a spelling.
  static readonly #wireTypes = new Map<unknown, (value: unknown) => boolean>([
    [String, isString],
    [ID, isString],
    [Int, isNumber],
    [Float, isNumber],
    [Boolean, (value) => typeof value === "boolean"],
    [Date, (value) => isString(value) || isNumber(value) || value instanceof Date || dayjs.isDayjs(value)],
  ]);

  //? A primitive argument may be query-string or path text, so it keeps `deserialize`'s coercion.
  static parse(argRef: Cls, arrDepth: number, value: unknown, option: ParseOption) {
    if (PrimitiveRegistry.has(argRef)) return deserialize(argRef, arrDepth, value, option);
    const { key, nullable = false } = option;
    if (value === null || value === undefined) {
      if (nullable) return null;
      throw new InvalidInputError(key, null);
    }
    return InputParser.#walk(value, arrDepth, key, (item, path) => InputParser.#value(argRef, item, path));
  }

  static #walk(value: unknown, arrDepth: number, path: string, parse: Parse): unknown {
    if (!arrDepth) return parse(value, path);
    if (!Array.isArray(value)) throw new InvalidInputError(path, "array");
    return value.map((item, idx) => InputParser.#walk(item, arrDepth - 1, `${path}.${idx}`, parse));
  }

  static #value(ref: Cls, value: unknown, path: string, enumRef?: EnumInstance): unknown {
    if (value === null || value === undefined) {
      if (ref === Any) return value ?? null;
      throw new InvalidInputError(path, null);
    }
    if (PrimitiveRegistry.has(ref)) return InputParser.#primitive(ref as typeof PrimitiveScalar, value, path, enumRef);
    if (ConstantRegistry.isScalar(ref)) return InputParser.#scalar(ref as ModelCls, value, path);
    return InputParser.#model(ref as ModelCls, value, path);
  }

  static #primitive(primitive: typeof PrimitiveScalar, value: unknown, path: string, enumRef?: EnumInstance) {
    const hasWireType = InputParser.#wireTypes.get(primitive);
    if (hasWireType && !hasWireType(value)) throw new InvalidInputError(path, primitive.refName);
    let parsed: unknown;
    try {
      parsed = primitive._parse(value as never);
    } catch {
      throw new InvalidInputError(path, primitive.refName);
    }
    if (enumRef && !enumRef.has(parsed as never))
      throw new InvalidInputError(path, `one of ${enumRef.values.join(", ")}`);
    return parsed;
  }

  // An embedded value object is written whole, so an absent field takes its default here, as `getDefault` builds it.
  static #scalar(ref: ModelCls, value: unknown, path: string) {
    if (!isRecord(value)) throw new InvalidInputError(path, "object");
    const defaults = defaultPlanOf(ref[FIELD_META]);
    const parsed: Record<string, unknown> = {};
    for (const entry of FieldPlan.of(ref).entries) {
      if (entry.kind === "computed") continue;
      const fieldPath = `${path}.${entry.key}`;
      const raw = value[entry.key];
      if (raw !== undefined) parsed[entry.key] = InputParser.#field(entry, raw, fieldPath);
      else if (InputParser.#isRequired(entry.field)) throw new InvalidInputError(fieldPath, null);
      else {
        const make = defaults.perCall.get(entry.key);
        parsed[entry.key] = make ? make() : defaults.shared[entry.key];
      }
    }
    return parsed;
  }

  //? A stored model's input leaves an absent field absent: an update sets only what it carries, and a create gets the
  //? field's default from the document.
  static #model(ref: ModelCls, value: unknown, path: string) {
    if (!isRecord(value)) throw new InvalidInputError(path, "object");
    const parsed: Record<string, unknown> = {};
    for (const entry of FieldPlan.of(ref).entries) {
      if (entry.kind === "computed") continue;
      const fieldPath = `${path}.${entry.key}`;
      const raw = value[entry.key];
      if (raw !== undefined) parsed[entry.key] = InputParser.#field(entry, raw, fieldPath);
      else if (InputParser.#isRequired(entry.field)) throw new InvalidInputError(fieldPath, null);
    }
    return parsed;
  }

  static #field({ field, isRelationRef }: FieldPlanEntry, value: unknown, path: string): unknown {
    if (value === null) {
      if (field.nullable || (field.modelRef as Cls) === Any) return null;
      throw new InvalidInputError(path, null);
    }
    return InputParser.#walk(value, field.arrDepth, path, (item, itemPath) => {
      if (field.isMap) return InputParser.#map(field.of as Cls | Cls[], item, itemPath);
      if (isRelationRef) return InputParser.#value(ID, item, itemPath);
      return InputParser.#value(field.modelRef, item, itemPath, field.enum);
    });
  }

  static #map(of: Cls | Cls[], value: unknown, path: string) {
    if (!isRecord(value)) throw new InvalidInputError(path, "object");
    const [valueRef, valueArrDepth] = getNonArrayModel(of);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        InputParser.#walk(item, valueArrDepth, `${path}.${key}`, (entry, entryPath) =>
          InputParser.#value(valueRef as Cls, entry, entryPath),
        ),
      ]),
    );
  }

  // The rule `prepareDocument` fills from: a default, an empty array, a constructible scalar, or an open `Any`.
  static #isRequired(field: ConstantField) {
    if (field.nullable || (field.modelRef as Cls) === Any) return false;
    if (field.default !== null && field.default !== undefined) return false;
    return !(field.isClass && field.isScalar);
  }
}
