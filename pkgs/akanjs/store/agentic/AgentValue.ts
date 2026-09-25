import {
  type CLIENT_VALUE,
  type Cls,
  type Dayjs,
  dayjs,
  type EnumInstance,
  type FIELD_META,
  type GetStateObject,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
  type UnCls,
} from "akanjs/base";
import { type ConstantModelRef, type MaskModel, mask, maskFieldsOf } from "akanjs/constant";

// biome-ignore lint/suspicious/noExplicitAny: enum values are arbitrary string/number literal unions.
type AgentSingleType = typeof PrimitiveScalar | EnumInstance<string, any> | ConstantModelRef;

/** What a readable declaration names its value as. One level of array, because a published value is one JSON shape. */
export type AgentFieldType = AgentSingleType | AgentSingleType[];

/**
 * A model class resolves to its state object rather than its instance type, so a component may hand over either
 * the hydrated document or the plain data copied out of one — masking reads the model that was named, not the
 * class the value still carries.
 *
 * A scalar is recognised by `refName` and has to be matched before `FIELD_META`: `via.ts` augments the global
 * `String`, `Boolean`, `Date` and `Map` constructors with `DatabaseConstantStatics`, so those four carry field
 * metadata and would otherwise read as models. A model carries no `refName`, and `Map` — carrying neither — falls
 * through to the model branch and is refused at declaration time instead.
 */
export type AgentValueOf<T> = T extends readonly (infer F)[]
  ? AgentValueOf<F>[]
  : T extends { refName: "Any" }
    ? unknown
    : T extends EnumInstance<string, infer V>
      ? V
      : T extends DateConstructor
        ? Dayjs | Date | string
        : T extends { refName: string; [CLIENT_VALUE]: infer V }
          ? V
          : T extends { [FIELD_META]: unknown }
            ? GetStateObject<UnCls<T>>
            : T extends { [CLIENT_VALUE]: infer V }
              ? V
              : unknown;

type ValueKind = "any" | "date" | "scalar" | "enum" | "model";

/**
 * Turns a declared type into what an agent may read of a value of that type.
 *
 * The type is the whole declaration: it typechecks what the component hands over, and it decides how the value is
 * rendered — a model class masks by that model, a `Date` leaves as an ISO string, a scalar passes. `Any` is the
 * escape hatch and passes the value untouched, so a payload nobody modeled stays publishable and the caller owns
 * whether it is JSON and whether it is worth its tokens.
 */
export class AgentValue {
  static serialize(type: AgentFieldType, value: unknown): unknown {
    const single = Array.isArray(type) ? type[0] : type;
    if (Array.isArray(type) && Array.isArray(value)) return value.map((item) => AgentValue.#one(single, item));
    return AgentValue.#one(single, value);
  }

  /**
   * Reports an unreadable type the way `st.tool` reports an undescribable argument — on the console, and the
   * declaration goes unpublished. Throwing would cost the route its server render over an agent-tooling mistake.
   */
  static publishable(owner: string, type: AgentFieldType): boolean {
    try {
      AgentValue.#kindOf(Array.isArray(type) ? type[0] : type);
      return true;
    } catch (error) {
      console.error(`${owner} is not published: its type is ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  static #one(type: AgentSingleType, value: unknown): unknown {
    if (value === null || value === undefined) return value;
    switch (AgentValue.#kindOf(type)) {
      case "date": {
        const parsed = dayjs(value as string | number | Date);
        return parsed.isValid() ? parsed.toISOString() : null;
      }
      case "model":
        return mask(type as MaskModel, value);
      default:
        return value;
    }
  }

  static #kindOf(type: AgentSingleType): ValueKind {
    if (isEnum(type as Cls)) return "enum";
    if (PrimitiveRegistry.has(type as unknown as Cls)) {
      const refName = PrimitiveRegistry.getName(type as typeof PrimitiveScalar);
      switch (refName) {
        case "Any":
          return "any";
        case "Date":
          return "date";
        case "ID":
        case "String":
        case "Int":
        case "Float":
        case "Boolean":
          return "scalar";
        default:
          throw new Error(`the scalar ${refName}, which an agent cannot read.`);
      }
    }
    if (maskFieldsOf(type as MaskModel)) return "model";
    throw new Error(`${AgentValue.#typeName(type)}, and a readable value is a scalar, an enum, a model, or Any.`);
  }

  static #typeName(type: AgentSingleType): string {
    const named = type as { name?: string } | null | undefined;
    return named?.name ? `the type ${named.name}` : `${String(type)}`;
  }
}
