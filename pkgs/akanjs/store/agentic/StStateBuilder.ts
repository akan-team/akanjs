import { capitalize } from "akanjs/common";
import type { ParamFieldType } from "akanjs/constant";
import type { Dispatch, SetStateAction } from "react";
import { type JsonSchema, useAgentState } from "use-agentic";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useRef } from "../hooks";
import { type AgentFieldType, AgentValue, type AgentValueOf } from "./AgentValue";
import { StToolBuilder } from "./StToolBuilder";

export interface StStateMeta {
  /** `false` keeps the key out of post-call diff reports — for values that change on their own every second. */
  report?: boolean;
  /** Publishes a `set<Name>` tool writing the type this state declares. Read-only without it. */
  set?: boolean;
}

interface StStateDeclaration {
  name: string | null;
  set: { schema: JsonSchema; type: ParamFieldType } | null;
}

/**
 * Local state past its description, waiting for its initial value. `.init()` is the one hook and returns what
 * `useState` returns.
 *
 * The declared type does both halves: it renders the read, and — with `set` — it is the schema of the setter tool
 * an agent writes through. A type nothing can describe costs the write, not the read and not the render.
 */
export class StStateBuilder<T extends AgentFieldType> {
  readonly #name: string | null;
  readonly #type: T;
  readonly #desc: string;
  readonly #meta: StStateMeta;

  constructor(name: string | null, type: T, desc: string, meta: StStateMeta = {}) {
    this.#name = name;
    this.#type = type;
    this.#desc = desc;
    this.#meta = meta;
  }

  init(
    initial: AgentValueOf<T> | (() => AgentValueOf<T>),
  ): [AgentValueOf<T>, Dispatch<SetStateAction<AgentValueOf<T>>>];
  init(
    initial: AgentValueOf<T> | null | (() => AgentValueOf<T> | null),
  ): [AgentValueOf<T> | null, Dispatch<SetStateAction<AgentValueOf<T> | null>>];
  // `unknown`, because TS compares an implementation signature's return against every overload's in both
  // directions, and a nullable state's setter is assignable to a non-nullable one's in neither.
  init(initial: AgentValueOf<T> | null | (() => AgentValueOf<T> | null)): unknown {
    type Value = AgentValueOf<T> | null;
    const name = this.#name;
    const type = this.#type;
    const declared = useRef<StStateDeclaration | null>(null);
    declared.current ??= {
      name: name && AgentValue.publishable(`st.useState("${name}")`, type) ? name : null,
      set: name && this.#meta.set ? StStateBuilder.#writable(name, type) : null,
    };
    const { set } = declared.current;
    return useAgentState<Value>(declared.current.name, initial, {
      description: this.#desc,
      report: this.#meta.report,
      serialize: (value) => AgentValue.serialize(type, value),
      ...(set
        ? {
            set: set.schema,
            parse: (value) =>
              StToolBuilder.checkedValue(`set${capitalize(name ?? "")}`, "value", set.type, value) as Value,
          }
        : {}),
    });
  }

  /** A `set` an agent could only call wrong leaves the key readable — the same trade `st.tool`'s `.arg` makes. */
  static #writable(name: string, type: AgentFieldType): StStateDeclaration["set"] {
    const scalar = type as unknown as ParamFieldType;
    try {
      return { schema: StToolBuilder.schemaOf(scalar), type: scalar };
    } catch (error) {
      console.error(
        `st.useState("${name}") stays read-only: writing ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
