import dayjsLib, { type Dayjs } from "dayjs";
import { CLIENT_VALUE, DEFAULT_VALUE, EXAMPLE_VALUE, PURIFIED_VALUE, SERVER_VALUE } from "./symbols";
import type { Cls } from "./types";

export type { Dayjs };

/** Shared dayjs factory re-export used by Akan documents, services, stores, and UI. */
export const dayjs = dayjsLib;

/** Registry that maps Akan primitive scalar names to their runtime scalar classes. */
export class PrimitiveRegistry {
  static readonly #namePrimitiveMap = new Map<string, typeof PrimitiveScalar>();
  static readonly #primitiveNameMap = new Map<typeof PrimitiveScalar, string>();
  static register(scalar: typeof PrimitiveScalar, { overwrite = false } = {}) {
    if (
      !overwrite &&
      (PrimitiveRegistry.#namePrimitiveMap.has(scalar.refName) || PrimitiveRegistry.#primitiveNameMap.has(scalar))
    )
      throw new Error(`Scalar ${scalar.refName} already registered`);
    PrimitiveRegistry.#namePrimitiveMap.set(scalar.refName, scalar);
    PrimitiveRegistry.#primitiveNameMap.set(scalar, scalar.refName);
  }
  static get(name: string): typeof PrimitiveScalar {
    const scalar = PrimitiveRegistry.#namePrimitiveMap.get(name);
    if (!scalar) throw new Error(`Scalar ${name} not found`);
    return scalar;
  }
  static getName(scalar: typeof PrimitiveScalar): string {
    const name = PrimitiveRegistry.#primitiveNameMap.get(scalar);
    if (!name) throw new Error(`Scalar ${scalar} not found`);
    return name;
  }
  static has(modelRef: Cls): boolean {
    return PrimitiveRegistry.#primitiveNameMap.has(modelRef as typeof PrimitiveScalar);
  }
  static hasName(name: string): boolean {
    return PrimitiveRegistry.#namePrimitiveMap.has(name);
  }
  static getNames(): string[] {
    return [...PrimitiveRegistry.#namePrimitiveMap.keys()];
  }
  static getAll(): (typeof PrimitiveScalar)[] {
    return [...PrimitiveRegistry.#namePrimitiveMap.values()];
  }
}

export type PrimitiveValue = string | number | boolean | Dayjs | Date | null | undefined;
export class PrimitiveScalar {
  static refName: string;
  static [SERVER_VALUE]: unknown;
  static [CLIENT_VALUE]: unknown;
  static [DEFAULT_VALUE]: unknown = null;
  static [PURIFIED_VALUE]: unknown = null;
  static [EXAMPLE_VALUE]: unknown = null;

  static validate(value: PrimitiveValue): boolean {
    return true;
  }
  static parseValue(value: PrimitiveValue): PrimitiveValue {
    return value;
  }
  static serializeValue(value: PrimitiveValue): PrimitiveValue {
    return value;
  }
  static _parse(
    this: typeof PrimitiveScalar,
    input: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): PrimitiveValue {
    if (optional && (input === null || input === undefined)) return undefined;
    // biome-ignore lint/complexity/noThisInStatic: subclasses provide scalar-specific parsing.
    const value = this.parseValue(input);
    // biome-ignore lint/complexity/noThisInStatic: subclasses provide scalar-specific validation.
    this._checkValue(value, { optional });
    return value;
  }
  static _serialize(
    this: typeof PrimitiveScalar,
    value: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): PrimitiveValue {
    // biome-ignore lint/complexity/noThisInStatic: subclasses provide scalar-specific validation.
    this._checkValue(value, { optional });
    if (value === null || value === undefined) return undefined;
    // biome-ignore lint/complexity/noThisInStatic: subclasses provide scalar-specific serialization.
    return this.serializeValue(value);
  }
  static _checkValue(
    this: typeof PrimitiveScalar,
    value: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): void {
    if (value === null || value === undefined) {
      if (optional) return;
      // biome-ignore lint/complexity/noThisInStatic: subclasses expose their own refName.
      else throw new Error(`Required ${this.refName} value: ${value}`);
    }
    // biome-ignore lint/complexity/noThisInStatic: subclasses provide scalar-specific validation.
    if (!this.validate(value)) throw new Error(`Invalid ${this.refName} value: ${value}`);
  }
}

/** Integer primitive scalar. Accepts safe integer numbers after parsing. */
export class Int extends PrimitiveScalar {
  static override refName: "Int" = "Int";
  static override [SERVER_VALUE]: number;
  static override [CLIENT_VALUE]: number;
  static override [DEFAULT_VALUE]: number = 0;
  static override [PURIFIED_VALUE]: number = 0;
  static override [EXAMPLE_VALUE]: number = 0;

  static override validate(value: string | number): boolean {
    return typeof value === "number" && Number.isSafeInteger(value);
  }
  static override parseValue(input: string | number): number {
    return Number(input);
  }
  static override serializeValue(value: number): number {
    return value;
  }
}
PrimitiveRegistry.register(Int);

/** Floating point primitive scalar. Accepts finite numbers after parsing. */
export class Float extends PrimitiveScalar {
  static override refName: "Float" = "Float";
  static override [SERVER_VALUE]: number;
  static override [CLIENT_VALUE]: number;
  static override [DEFAULT_VALUE]: number = 0;
  static override [PURIFIED_VALUE]: number = 0;
  static override [EXAMPLE_VALUE]: number = 0;

  static override validate(value: string | number): boolean {
    return typeof value === "number" && Number.isFinite(value);
  }
  static override parseValue(input: string | number): number {
    return Number(input);
  }
  static override serializeValue(value: number): number {
    return value;
  }
}
PrimitiveRegistry.register(Float);

/** 24-character hexadecimal id primitive used by Akan document and signal models. */
export class ID extends PrimitiveScalar {
  static override refName: "ID" = "ID";
  static override [SERVER_VALUE]: string;
  static override [CLIENT_VALUE]: string;
  static override [DEFAULT_VALUE]: string = "";
  static override [PURIFIED_VALUE]: string = "";
  static override [EXAMPLE_VALUE]: string = "1234567890abcdef12345678";

  static override validate(value: string): boolean {
    if (typeof value !== "string") return false;
    return /^[0-9a-fA-F]{24}$/.test(value);
  }
  static override parseValue(input: string): string {
    return String(input);
  }
  static override serializeValue(value: string): string {
    return String(value);
  }
  static override _checkValue(value: PrimitiveValue, options: { optional?: boolean } = {}): void {
    if (value === ID[DEFAULT_VALUE]) return;
    // biome-ignore lint/complexity/noThisInStatic: ID keeps shared primitive validation after allowing its default placeholder.
    super._checkValue(value, options);
  }
}
PrimitiveRegistry.register(ID);

/** Open object primitive for intentionally flexible payloads or metadata blobs. */
export class Any extends PrimitiveScalar {
  static override refName: "Any" = "Any";
  static override [DEFAULT_VALUE]: object | null = null;
  static override [EXAMPLE_VALUE]: object = {};
}
PrimitiveRegistry.register(Any);

export class Upload extends PrimitiveScalar {
  static override refName: "Upload" = "Upload";
  static override [SERVER_VALUE]: File;
  static override [CLIENT_VALUE]: File;
  static override [DEFAULT_VALUE]: File | null = null;
  static override [PURIFIED_VALUE]: File;
  static override [EXAMPLE_VALUE] = "FileUpload";
  __TEMP_TYPE__: "Upload" = "Upload";
}
PrimitiveRegistry.register(Upload);

declare global {
  interface StringConstructor {
    refName: "String";
    [SERVER_VALUE]: string;
    [CLIENT_VALUE]: string;
    [DEFAULT_VALUE]: string;
    [PURIFIED_VALUE]: string;
    [EXAMPLE_VALUE]: string;
    validate(value: string): boolean;
    parseValue(input: string): string;
    serializeValue(value: string): string;
    _parse(input: string): string;
    _serialize(value: string): string;
    _checkValue(value: string): void;
  }
  interface BooleanConstructor {
    refName: "Boolean";
    [SERVER_VALUE]: boolean;
    [CLIENT_VALUE]: boolean;
    [DEFAULT_VALUE]: boolean;
    [PURIFIED_VALUE]: boolean;
    [EXAMPLE_VALUE]: boolean;
    validate(value: boolean | number): boolean;
    parseValue(input: boolean | number): boolean | number;
    serializeValue(value: boolean | number): boolean | number;
    _parse(input: boolean | number): boolean;
    _serialize(value: boolean | number): boolean;
    _checkValue(value: boolean | number): void;
  }
  interface DateConstructor {
    refName: "Date";
    [SERVER_VALUE]: Dayjs;
    [CLIENT_VALUE]: Dayjs;
    [DEFAULT_VALUE]: Dayjs;
    [PURIFIED_VALUE]: Dayjs;
    [EXAMPLE_VALUE]: string;
    validate(value: Date): boolean;
    parseValue(input: Date): Dayjs;
    serializeValue(value: Dayjs | Date): Date;
    _parse(input: Date): Dayjs;
    _serialize(value: Dayjs | Date): Date;
    _checkValue(value: Date): void;
  }
}

const scalarPrimitiveStatics = {
  _parse(
    this: typeof PrimitiveScalar,
    input: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): PrimitiveValue {
    if (optional && (input === null || input === undefined)) return undefined;
    const value = this.parseValue(input);
    this._checkValue(value, { optional });
    return value;
  },
  _serialize(
    this: typeof PrimitiveScalar,
    value: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): PrimitiveValue {
    if (optional && value === "") return undefined;
    if (this.refName === "Date" && optional && typeof value === "string" && Number.isNaN(new Date(value).getTime()))
      return undefined;
    if (this.refName === "Date" && optional && value instanceof Date && Number.isNaN(value.getTime())) return undefined;
    if (
      optional &&
      value &&
      typeof value === "object" &&
      "isValid" in value &&
      !(value as { isValid: () => boolean }).isValid()
    )
      return undefined;
    this._checkValue(value, { optional });
    if (value === null || value === undefined) return undefined;
    return this.serializeValue(value);
  },
  _checkValue(
    this: typeof PrimitiveScalar,
    value: PrimitiveValue,
    { optional = false }: { optional?: boolean } = {},
  ): void {
    if (value === null || value === undefined) {
      if (optional) return;
      else throw new Error(`Required ${this.refName} value: ${value}`);
    }
    if (optional && value === "") return;
    if (this.refName === "Date" && optional && typeof value === "string" && Number.isNaN(new Date(value).getTime()))
      return;
    if (this.refName === "Date" && optional && value instanceof Date && Number.isNaN(value.getTime())) return;
    if (
      optional &&
      value &&
      typeof value === "object" &&
      "isValid" in value &&
      !(value as { isValid: () => boolean }).isValid()
    )
      return;
    if (!this.validate(value)) throw new Error(`Invalid ${this.refName} value: ${value}`);
  },
};

// String
Object.assign(String, scalarPrimitiveStatics, {
  refName: "String",
  [DEFAULT_VALUE]: "",
  [EXAMPLE_VALUE]: "String",
  validate(value: string) {
    return typeof value === "string";
  },
  parseValue(input: string) {
    return String(input);
  },
  serializeValue(value: string) {
    return String(value);
  },
});
PrimitiveRegistry.register(String);

// Boolean
const normalizeBooleanPrimitiveValue = (value: boolean | number): boolean | null => {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  return null;
};

Object.assign(Boolean, {
  ...scalarPrimitiveStatics,
  refName: "Boolean",
  [DEFAULT_VALUE]: false,
  [EXAMPLE_VALUE]: true,
  validate(value: boolean | number) {
    return normalizeBooleanPrimitiveValue(value) !== null;
  },
  parseValue(input: boolean | number) {
    return normalizeBooleanPrimitiveValue(input) ?? input;
  },
  serializeValue(value: boolean | number) {
    return normalizeBooleanPrimitiveValue(value) ?? value;
  },
});
PrimitiveRegistry.register(Boolean);

// Date
Object.assign(Date, {
  ...scalarPrimitiveStatics,
  refName: "Date",
  [DEFAULT_VALUE]: dayjs(new Date(-1)),
  [EXAMPLE_VALUE]: dayjs(new Date().toISOString()),
  validate(value: Date | string | number) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return true;
  },
  parseValue(input: Date | string | number | Dayjs) {
    return dayjs(input);
  },
  serializeValue(value: Dayjs | Date | string | number) {
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") return dayjs(value).toDate();
    return value.toDate();
  },
});
PrimitiveRegistry.register(Date);

export type DefaultPrimitiveName = "String" | "Boolean" | "Date" | "Int" | "Float" | "ID" | "Any" | "Upload";
