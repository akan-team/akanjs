import { useAgentResource } from "use-agentic";
// Through the `"use client"` shim, not `react` — see `StToolBuilder`.
import { useRef } from "../hooks";
import { type AgentFieldType, AgentValue, type AgentValueOf } from "./AgentValue";

export interface StExposeMeta {
  /** `false` keeps the key out of post-call diff reports — for values that change on their own every second. */
  report?: boolean;
}

/**
 * A read-only value past its description, waiting for the value itself. `.value()` is the one hook.
 *
 * The declared type is what makes the read safe: it typechecks what the component hands over and it decides how
 * the value is rendered, so a model's `hidden` and `secret` fields are stripped by the model that was named
 * rather than by whatever class the value still happens to carry.
 */
export class StExposeBuilder<T extends AgentFieldType> {
  readonly #name: string | null;
  readonly #type: T;
  readonly #desc: string;
  readonly #meta: StExposeMeta;

  constructor(name: string | null, type: T, desc: string, meta: StExposeMeta = {}) {
    this.#name = name;
    this.#type = type;
    this.#desc = desc;
    this.#meta = meta;
  }

  /**
   * A thunk is read when the agent reads, which is the difference that matters for a value assembled out of a ref
   * the children fill in after this render — computing it here would publish whatever was there before they ran.
   */
  value(value: AgentValueOf<T> | (() => AgentValueOf<T>) | null | undefined): void {
    const declared = useRef<{ name: string | null } | null>(null);
    declared.current ??= {
      name: this.#name && AgentValue.publishable(`st.expose("${this.#name}")`, this.#type) ? this.#name : null,
    };
    useAgentResource(declared.current.name, value, {
      description: this.#desc,
      report: this.#meta.report,
      serialize: (current) =>
        AgentValue.serialize(this.#type, typeof current === "function" ? (current as () => unknown)() : current),
    });
  }
}
