import { type Cls, type EnumInstance, isEnum, PrimitiveRegistry, type PrimitiveScalar } from "akanjs/base";
import { deserialize, type FieldToValue, type ParamFieldType } from "akanjs/constant";
import { MigrationError } from "./migrationError";

export interface MigrationParamOption<Value = unknown> {
  /** What the value means, shown beside its input on the approval form — so English. */
  desc?: string;
  /** For a `String`, the values it may take. */
  enum?: readonly string[];
  default?: Value;
  /** Left out, the value is `null` rather than a refusal. */
  nullable?: boolean;
}

export type MigrationParamValue<Type, Option> = Option extends { default: unknown }
  ? MigrationParamBase<Type, Option>
  : Option extends { nullable: true }
    ? MigrationParamBase<Type, Option> | null
    : MigrationParamBase<Type, Option>;

type MigrationParamBase<Type, Option> = Option extends { enum: readonly (infer Value)[] } ? Value : FieldToValue<Type>;

export interface MigrationParamInfo extends MigrationParamOption {
  name: string;
  type: ParamFieldType;
}

/** One declared param as `list` reports it, enough to build its input. */
export interface MigrationParamSpec {
  name: string;
  type: string;
  required: boolean;
  enum?: readonly (string | number)[];
  default?: unknown;
  desc?: string;
}

export class MigrationParams {
  readonly list: MigrationParamInfo[] = [];

  declare(info: MigrationParamInfo) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(info.name))
      throw new Error(`Migration param "${info.name}" must start with a letter and hold letters, digits and _`);
    if (this.list.some((existing) => existing.name === info.name))
      throw new Error(`Migration param "${info.name}" is declared twice`);
    this.list.push(info);
  }

  parse(raw: Record<string, string>): Record<string, unknown> {
    const unknown = Object.keys(raw).find((name) => !this.list.some((info) => info.name === name));
    if (unknown)
      throw new MigrationError(
        "invalidParam",
        `Unknown param "${unknown}"; this migration takes ${this.list.map(({ name }) => name).join(", ") || "none"}`,
      );
    return Object.fromEntries(this.list.map((info) => [info.name, MigrationParams.#value(info, raw[info.name])]));
  }

  /** Params a run recorded as JSON, as their declared types again: what a rollback hands the script. */
  revive(stored: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      this.list.map((info) => {
        const value = stored[info.name];
        if (value === undefined || value === null) return [info.name, value ?? info.default ?? null];
        try {
          return [info.name, MigrationParams.#deserialize(info, value)];
        } catch {
          return [info.name, value];
        }
      }),
    );
  }

  specs(): MigrationParamSpec[] {
    return this.list.map((info) => ({
      name: info.name,
      type: MigrationParams.#typeName(info),
      required: !("default" in info) && !info.nullable,
      ...(MigrationParams.#choices(info) ? { enum: MigrationParams.#choices(info) } : {}),
      ...("default" in info ? { default: info.default } : {}),
      ...(info.desc ? { desc: info.desc } : {}),
    }));
  }

  static #value(info: MigrationParamInfo, raw: string | undefined) {
    if (raw === undefined || raw === "") {
      if ("default" in info) return info.default;
      if (info.nullable) return null;
      throw new MigrationError("invalidParam", `Param "${info.name}" is required`);
    }
    //* A date alone is midnight UTC, so a plan hashes the same on a laptop and in a container.
    const input = (info.type as unknown) === Date && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
    let value: unknown;
    try {
      value = MigrationParams.#deserialize(info, input);
    } catch {
      throw new MigrationError("invalidParam", `Param "${info.name}" expects ${MigrationParams.#typeName(info)}`);
    }
    if (info.enum && !info.enum.includes(value as string))
      throw new MigrationError("invalidParam", `Param "${info.name}" expects one of ${info.enum.join(", ")}`);
    return value;
  }

  static #deserialize(info: MigrationParamInfo, value: unknown) {
    const enumRef = isEnum(info.type as Cls) ? (info.type as EnumInstance) : undefined;
    const scalar = (enumRef ? enumRef.type : info.type) as typeof PrimitiveScalar;
    return deserialize(scalar as never, 0, value, { key: info.name, enum: enumRef });
  }

  static #choices(info: MigrationParamInfo): readonly (string | number)[] | undefined {
    if (isEnum(info.type as Cls)) return (info.type as EnumInstance).values as readonly (string | number)[];
    return info.enum;
  }

  static #typeName(info: MigrationParamInfo) {
    const choices = MigrationParams.#choices(info);
    if (choices) return `one of ${choices.join(", ")}`;
    return PrimitiveRegistry.has(info.type as Cls)
      ? PrimitiveRegistry.getName(info.type as typeof PrimitiveScalar)
      : "a value";
  }
}
