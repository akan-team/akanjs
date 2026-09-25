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
import {
  AgenticSurface,
  type JsonSchema,
  type ToolConfirm,
  type ToolGuard,
  useScopePath,
  useSurface,
} from "use-agentic";
import { tagAction } from "../actionTag";
// Through the `"use client"` shim, not `react` — the RSC pages bundle stubs client modules per file, and a raw
// react-hook import here resolves against react's react-server build, which has no hooks. Same as `storeInstance`.
import { useEffect, useRef } from "../hooks";

export interface StToolMeta {
  /**
   * Whether the call has to be waited out before what it did to the screen is reported back to the model. `false`
   * is a read that returns what is already there; the default waits, because a write may still be landing when
   * `exec` resolves and a report taken then describes the screen one tick before the call.
   */
  settle?: boolean;
  confirm?: ToolConfirm;
  guard?: ToolGuard;
}

interface StToolArg {
  name: string;
  type: ParamFieldType;
  optional: boolean;
  oneOf?: readonly (string | number)[];
}

/** `oneOf` is the runtime half of `enumOf`: a value set only known once the component renders. */
export interface StToolArgOption<V> {
  oneOf?: readonly V[];
}

type ArgValue<T> = T extends EnumInstance<string, infer V> ? V : T extends { [CLIENT_VALUE]: infer V } ? V : never;

/**
 * A component tool past its description: `.arg()` for what the caller must pass, `.opt()` for what it may, and
 * one `.exec()`.
 *
 * This is not A12's rejected store-action builder — a store action derives its schema from the endpoint it is
 * named after, while a component tool exists nowhere else, so declaring is the only source there is. `.arg()` and
 * `.opt()` only accumulate data; `.exec()` is the one hook, so the chain must complete in one unconditional
 * statement.
 *
 * A falsy name declares the tool without publishing it: the callable still works for the click that a person
 * makes, and nothing reaches the agent. That is how a conditional surface stays writable at all — `.exec()` is a
 * hook, so a component can never skip the declaration, only the publication.
 */
export class StToolBuilder<Args extends unknown[] = []> {
  readonly #name: string | null;
  readonly #desc: string;
  readonly #meta: StToolMeta;
  readonly #args: StToolArg[];

  constructor(name: string | null, desc: string, meta: StToolMeta = {}, args: StToolArg[] = []) {
    this.#name = name;
    this.#desc = desc;
    this.#meta = meta;
    this.#args = args;
  }

  arg<T extends ParamFieldType>(name: string, type: T): StToolBuilder<[...Args, ArgValue<T>]>;
  arg<T extends ParamFieldType, const V extends ArgValue<T>>(
    name: string,
    type: T,
    option: StToolArgOption<V>,
  ): StToolBuilder<[...Args, V]>;
  arg<T extends ParamFieldType>(
    name: string,
    type: T,
    option: StToolArgOption<ArgValue<T>> = {},
  ): StToolBuilder<[...Args, ArgValue<T>]> {
    return this.#push(name, type, false, option) as StToolBuilder<[...Args, ArgValue<T>]>;
  }

  opt<T extends ParamFieldType>(name: string, type: T): StToolBuilder<[...Args, ArgValue<T> | null]>;
  opt<T extends ParamFieldType, const V extends ArgValue<T>>(
    name: string,
    type: T,
    option: StToolArgOption<V>,
  ): StToolBuilder<[...Args, V | null]>;
  opt<T extends ParamFieldType>(
    name: string,
    type: T,
    option: StToolArgOption<ArgValue<T>> = {},
  ): StToolBuilder<[...Args, ArgValue<T> | null]> {
    return this.#push(name, type, true, option);
  }

  #push<T extends ParamFieldType>(
    name: string,
    type: T,
    optional: boolean,
    option: StToolArgOption<ArgValue<T>>,
  ): StToolBuilder<[...Args, ArgValue<T> | null]> {
    // An argument nothing can describe withdraws the whole tool — the same withholding a falsy name performs, so
    // the callable still drives the click a person makes and the route still renders. Publishing the rest of the
    // arguments would hand an agent a tool it can only call wrong; throwing would cost a page its server render
    // over an agent-tooling concern. Reported here, where the type was written, rather than on the first call.
    const published = this.#name && StToolBuilder.#describable(this.#name, name, type) ? this.#name : null;
    return new StToolBuilder(published, this.#desc, this.#meta, [
      ...this.#args,
      { name, type, optional, ...(option.oneOf ? { oneOf: option.oneOf } : {}) },
    ]);
  }

  /** The only hook in the chain. `run`, `guard`, and `confirm` stay always-latest; the declaration is mount-static. */
  exec(run: (...args: Args) => unknown): (...args: Args) => Promise<void> {
    const surface = useSurface();
    const scope = useScopePath();
    const live = useRef({ run, meta: this.#meta });
    live.current = { run, meta: this.#meta };
    const declared = useRef<{ name: string | null; desc: string; meta: StToolMeta; args: StToolArg[] } | null>(null);
    declared.current ??= { name: this.#name, desc: this.#desc, meta: this.#meta, args: this.#args };
    const callable = useRef<((...args: Args) => Promise<void>) | null>(null);
    if (!callable.current) {
      const call = async (...args: Args) => {
        await live.current.run(...args);
      };
      // No name, no annotation: `data-akan-action` names a tool an agent can reach, and this one is unreachable.
      callable.current = this.#name ? tagAction(call, { action: AgenticSurface.fullName(scope, this.#name) }) : call;
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
    return callable.current;
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
    const schema = StToolBuilder.schemaOf(arg.type);
    return arg.oneOf ? { ...schema, enum: [...arg.oneOf] } : schema;
  }

  static #describable(toolName: string, argName: string, type: ParamFieldType): boolean {
    try {
      StToolBuilder.schemaOf(type);
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

  /** Scalars and enums only — the value arrives as JSON from a model, so a class instance has no way in. */
  static schemaOf(type: ParamFieldType): JsonSchema {
    if (isEnum(type as Cls)) {
      const enumRef = type as EnumInstance;
      const kind = enumRef.type === String ? "string" : enumRef.type === Int ? "integer" : "number";
      return { type: kind, enum: [...enumRef.values] };
    }
    const scalar = type as typeof PrimitiveScalar;
    if (!PrimitiveRegistry.has(scalar as unknown as Cls))
      throw new Error(`${StToolBuilder.#typeName(type)}, and st.tool takes scalar and enum arguments only.`);
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

  static #typeName(type: ParamFieldType): string {
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

  /** What `AgentBridge` does for endpoint arguments, for a component tool's own — nothing on the wire enforces the published schema. */
  static checkedValue(
    toolName: string,
    argName: string,
    type: ParamFieldType,
    value: unknown,
    oneOf?: readonly (string | number)[],
  ): unknown {
    const checked = StToolBuilder.#checkedScalar(toolName, argName, type, value);
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
