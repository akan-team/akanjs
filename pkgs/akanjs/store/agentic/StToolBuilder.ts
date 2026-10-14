import {
  type CLIENT_VALUE,
  type Cls,
  dayjs,
  type EnumInstance,
  Int,
  isEnum,
  PrimitiveRegistry,
  type PrimitiveScalar,
} from "akanjs/base";
import type { ParamFieldType } from "akanjs/constant";
import type { ReactNode } from "react";
import {
  AgenticSurface,
  type JsonSchema,
  type ToolConfirm,
  type ToolGuard,
  useScopePath,
  useSurface,
} from "use-agentic";
import { tagAction } from "../actionTag";
// Through the `"use client"` shim: a raw `react` import resolves to react-server in the RSC bundle, which has no hooks.
import { useEffect, useRef } from "../hooks";

/** `submit`'s value is what the model reads back; the first of the two calls settles the card. */
export interface StToolCardControl {
  submit: (value: unknown) => void;
  cancel: (reason?: string) => void;
}

export interface StToolMeta {
  /** Default true: the screen is waited out before the call reports; `false` for a read of what is already there. */
  settle?: boolean;
  confirm?: ToolConfirm;
  guard?: ToolGuard;
  /** What a person reads for this action in a command palette, in their language (an `l()` result); never the model. */
  label?: string;
}

/** A scalar, an enum, or one array level of either. */
export type StToolArgType = ParamFieldType | readonly [ParamFieldType];

interface StToolArg {
  name: string;
  type: StToolArgType;
  optional: boolean;
  oneOf?: readonly (string | number)[];
}

/** `oneOf` is the runtime half of `enumOf`: a value set only known once the component renders. */
export interface StToolArgOption<V> {
  oneOf?: readonly V[];
}

type ScalarValue<T> = T extends EnumInstance<string, infer V> ? V : T extends { [CLIENT_VALUE]: infer V } ? V : never;
type ElementValue<T> = T extends readonly [infer E] ? ScalarValue<E> : ScalarValue<T>;
type ArgValue<T> = T extends readonly [unknown] ? ElementValue<T>[] : ElementValue<T>;
type NarrowedValue<T, V> = T extends readonly [unknown] ? V[] : V;

/** `.arg()`/`.opt()` only accumulate; `.exec()` is the hook. A falsy name declares the tool without publishing it. */
export class StToolBuilder<Args extends unknown[] = []> {
  readonly #name: string | null;
  readonly #desc: string;
  readonly #meta: StToolMeta;
  readonly #args: StToolArg[];

  constructor(name: string | null, desc: string, meta: StToolMeta = {}, args: StToolArg[] = []) {
    // One "withheld" value: `""` alternating with `null` would compare as a different tool between renders.
    this.#name = name || null;
    this.#desc = desc;
    this.#meta = meta;
    this.#args = args;
  }

  arg<T extends StToolArgType>(name: string, type: T): StToolBuilder<[...Args, ArgValue<T>]>;
  arg<T extends StToolArgType, const V extends ElementValue<T>>(
    name: string,
    type: T,
    option: StToolArgOption<V>,
  ): StToolBuilder<[...Args, NarrowedValue<T, V>]>;
  arg<T extends StToolArgType>(
    name: string,
    type: T,
    option: StToolArgOption<ElementValue<T>> = {},
  ): StToolBuilder<[...Args, ArgValue<T>]> {
    return this.#push(name, type, false, option) as StToolBuilder<[...Args, ArgValue<T>]>;
  }

  opt<T extends StToolArgType>(name: string, type: T): StToolBuilder<[...Args, ArgValue<T> | null]>;
  opt<T extends StToolArgType, const V extends ElementValue<T>>(
    name: string,
    type: T,
    option: StToolArgOption<V>,
  ): StToolBuilder<[...Args, NarrowedValue<T, V> | null]>;
  opt<T extends StToolArgType>(
    name: string,
    type: T,
    option: StToolArgOption<ElementValue<T>> = {},
  ): StToolBuilder<[...Args, ArgValue<T> | null]> {
    return this.#push(name, type, true, option);
  }

  #push<T extends StToolArgType>(
    name: string,
    type: T,
    optional: boolean,
    option: StToolArgOption<ElementValue<T>>,
  ): StToolBuilder<[...Args, ArgValue<T> | null]> {
    // An undescribable argument withholds the tool (logged) rather than throwing and costing the page its render.
    const published = this.#name && StToolBuilder.#describable(this.#name, name, type) ? this.#name : null;
    return new StToolBuilder(published, this.#desc, this.#meta, [
      ...this.#args,
      { name, type, optional, ...(option.oneOf ? { oneOf: option.oneOf } : {}) },
    ]);
  }

  /** The hook. `run`/`guard`/`confirm` and the name follow every render; `desc`/`args` are read once per name. */
  exec(run: (...args: Args) => unknown): (...args: Args) => Promise<void> {
    const surface = useSurface();
    const scope = useScopePath();
    const live = useRef({ run, meta: this.#meta });
    live.current = { run, meta: this.#meta };
    const declared = useRef<{ name: string | null; desc: string; meta: StToolMeta; args: StToolArg[] } | null>(null);
    if (declared.current?.name !== this.#name)
      declared.current = { name: this.#name, desc: this.#desc, meta: this.#meta, args: this.#args };
    const callable = useRef<{ name: string | null; fn: (...args: Args) => Promise<void> } | null>(null);
    if (callable.current?.name !== this.#name) {
      const call = async (...args: Args) => {
        await live.current.run(...args);
      };
      callable.current = {
        name: this.#name,
        fn: this.#name ? tagAction(call, { action: AgenticSurface.fullName(scope, this.#name) }) : call,
      };
    }
    const scopeKey = scope.join(".");
    useEffect(() => {
      const spec = declared.current;
      const name = spec?.name;
      if (!spec || !name) return;
      return surface.registerTool(scope, {
        name,
        description: spec.desc,
        settle: spec.meta.settle,
        parameters: StToolBuilder.parametersOf(spec.args),
        label: () => live.current.meta.label,
        // A `remove*` tool confirms unless it declares otherwise — destructiveness read off the key, as MCP hints are.
        ...(spec.meta.confirm === undefined && !name.startsWith("remove")
          ? {}
          : {
              confirm: (args: Record<string, unknown>) => {
                const confirm = live.current.meta.confirm ?? name.startsWith("remove");
                return typeof confirm === "function" ? confirm(args) : confirm;
              },
            }),
        ...(spec.meta.guard === undefined
          ? {}
          : { guard: (args: Record<string, unknown>) => live.current.meta.guard?.(args) ?? true }),
        run: (named) => live.current.run(...(StToolBuilder.positionalOf(name, spec.args, named) as Args)),
      });
    }, [surface, scopeKey, this.#name]);
    return callable.current.fn;
  }

  /** A tool the user answers with a chat card. Args are checked in the guard, before the card parks; no `confirm`. */
  card(render: (control: StToolCardControl, ...args: Args) => ReactNode): void {
    const surface = useSurface();
    const scope = useScopePath();
    const live = useRef({ render, meta: this.#meta });
    live.current = { render, meta: this.#meta };
    const declared = useRef<{ name: string | null; desc: string; meta: StToolMeta; args: StToolArg[] } | null>(null);
    if (declared.current?.name !== this.#name)
      declared.current = { name: this.#name, desc: this.#desc, meta: this.#meta, args: this.#args };
    const scopeKey = scope.join(".");
    useEffect(() => {
      const spec = declared.current;
      const name = spec?.name;
      if (!spec || !name) return;
      return surface.registerTool(scope, {
        name,
        description: spec.desc,
        settle: spec.meta.settle,
        parameters: StToolBuilder.parametersOf(spec.args),
        guard: (args) => {
          try {
            StToolBuilder.positionalOf(name, spec.args, args);
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
          return live.current.meta.guard?.(args) ?? true;
        },
        card: ({ args, submit, cancel }) =>
          live.current.render({ submit, cancel }, ...(StToolBuilder.positionalOf(name, spec.args, args) as Args)),
      });
    }, [surface, scopeKey, this.#name]);
  }

  static parametersOf(args: StToolArg[]): JsonSchema | undefined {
    if (!args.length) return undefined;
    const required = args.filter((arg) => !arg.optional).map((arg) => arg.name);
    return {
      type: "object",
      properties: Object.fromEntries(args.map((arg) => [arg.name, StToolBuilder.#argSchemaOf(arg)])),
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    };
  }

  static #argSchemaOf(arg: StToolArg): JsonSchema {
    return StToolBuilder.#schemaOfArg(arg.type, arg.oneOf);
  }

  static #schemaOfArg(type: StToolArgType, oneOf?: readonly (string | number)[]): JsonSchema {
    const narrowed = (schema: JsonSchema): JsonSchema => (oneOf ? { ...schema, enum: [...oneOf] } : schema);
    if (!Array.isArray(type)) return narrowed(StToolBuilder.schemaOf(type as ParamFieldType));
    const element = type[0] as StToolArgType;
    if (Array.isArray(element))
      throw new Error("an array of arrays, and st.tool takes one array level of a scalar or an enum.");
    return { type: "array", items: narrowed(StToolBuilder.schemaOf(element as ParamFieldType)) };
  }

  static #describable(toolName: string, argName: string, type: StToolArgType): boolean {
    try {
      StToolBuilder.#schemaOfArg(type);
      return true;
    } catch (error) {
      console.error(
        `st.tool("${toolName}") is not published: its "${argName}" argument is ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /** Scalars and enums only (a value arrives as JSON); throws for anything else. */
  static schemaOf(type: ParamFieldType): JsonSchema {
    if (isEnum(type as Cls)) {
      const enumRef = type as EnumInstance;
      const kind = enumRef.type === String ? "string" : enumRef.type === Int ? "integer" : "number";
      return { type: kind, enum: [...enumRef.values] };
    }
    const scalar = type as typeof PrimitiveScalar;
    if (!PrimitiveRegistry.has(scalar as unknown as Cls))
      throw new Error(`${StToolBuilder.#typeName(type)}, and st.tool takes a scalar, an enum, or one array of either.`);
    switch (PrimitiveRegistry.getName(scalar)) {
      case "ID":
      case "String":
        return { type: "string" };
      case "Int":
        return { type: "integer" };
      case "Float":
        return { type: "number" };
      case "Boolean":
        return { type: "boolean" };
      case "Date":
        return { type: "string", format: "date-time" };
      default:
        throw new Error(`the scalar ${PrimitiveRegistry.getName(scalar)}, which st.tool cannot describe.`);
    }
  }

  static #typeName(type: StToolArgType): string {
    if (Array.isArray(type)) return `an array of ${StToolBuilder.#typeName(type[0] as StToolArgType)}`;
    const named = type as { name?: string } | null | undefined;
    return named?.name ? `the type ${named.name}` : `${String(type)}`;
  }

  static positionalOf(toolName: string, args: StToolArg[], named: Record<string, unknown>): unknown[] {
    return args.map((arg) => {
      const value = named[arg.name];
      if (value === undefined || value === null) {
        if (arg.optional) return null;
        throw new Error(`Missing argument "${arg.name}" for ${toolName}.`);
      }
      return StToolBuilder.checkedValue(toolName, arg.name, arg.type, value, arg.oneOf);
    });
  }

  /** Nothing on the wire enforces the published schema, so every argument value is checked here. */
  static checkedValue(
    toolName: string,
    argName: string,
    type: StToolArgType,
    value: unknown,
    oneOf?: readonly (string | number)[],
  ): unknown {
    if (Array.isArray(type)) {
      if (!Array.isArray(value)) throw new Error(`Argument "${argName}" of ${toolName} must be an array.`);
      const element = type[0] as StToolArgType;
      return value.map((item, idx) => StToolBuilder.checkedValue(toolName, `${argName}[${idx}]`, element, item, oneOf));
    }
    const checked = StToolBuilder.#checkedScalar(toolName, argName, type as ParamFieldType, value);
    if (oneOf && !oneOf.includes(checked as string | number))
      throw new Error(`Argument "${argName}" of ${toolName} must be one of: ${oneOf.join(", ")}.`);
    return checked;
  }

  static #checkedScalar(toolName: string, argName: string, type: ParamFieldType, value: unknown): unknown {
    if (isEnum(type as Cls)) {
      const enumRef = type as EnumInstance;
      if (!enumRef.values.includes(value as never))
        throw new Error(`Argument "${argName}" of ${toolName} must be one of: ${[...enumRef.values].join(", ")}.`);
      return value;
    }
    switch (PrimitiveRegistry.getName(type as typeof PrimitiveScalar)) {
      case "ID":
      case "String":
        if (typeof value !== "string") throw new Error(`Argument "${argName}" of ${toolName} must be a string.`);
        return value;
      case "Int":
        if (!Number.isInteger(value)) throw new Error(`Argument "${argName}" of ${toolName} must be a whole number.`);
        return value;
      case "Float":
        if (typeof value !== "number" || !Number.isFinite(value))
          throw new Error(`Argument "${argName}" of ${toolName} must be a finite number.`);
        return value;
      case "Boolean":
        if (typeof value !== "boolean") throw new Error(`Argument "${argName}" of ${toolName} must be a boolean.`);
        return value;
      case "Date": {
        const parsed = dayjs(value as string | number | Date);
        if (!parsed.isValid()) throw new Error(`Argument "${argName}" of ${toolName} must be an ISO 8601 date string.`);
        return parsed;
      }
      default:
        return value;
    }
  }
}
