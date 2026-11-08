import { stateSetterName } from "akanjs/common";
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
  key: string | null;
  name: string | null;
  set: { schema: JsonSchema; type: ParamFieldType } | null;
}

/** `.init()` is the hook and returns what `useState` returns; an undescribable type costs only the setter tool. */
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
  // `unknown`: TS checks the return against every overload both ways, and the two setters assign in neither.
  init(initial: AgentValueOf<T> | null | (() => AgentValueOf<T> | null)): unknown {
    type Value = AgentValueOf<T> | null;
    const name = this.#name;
    const type = this.#type;
    const declared = useRef<StStateDeclaration | null>(null);
    // Re-resolved on a name change, not frozen: a withheld name that appears later must publish, and vice versa.
    if (declared.current?.key !== name)
      declared.current = {
        key: name,
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
              StToolBuilder.checkedValue(stateSetterName(name ?? ""), "value", set.type, value) as Value,
          }
        : {}),
    });
  }

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
