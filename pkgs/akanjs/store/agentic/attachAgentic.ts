import type { AgentFieldType } from "./AgentValue";
import type { StExposeMeta } from "./StExposeBuilder";
import { StExposeDraft } from "./StExposeDraft";
import type { StStateMeta } from "./StStateBuilder";
import { StStateDraft } from "./StStateDraft";
import type { StToolMeta } from "./StToolBuilder";
import { StToolDraft } from "./StToolDraft";

export interface StAgentic {
  /**
   * Local state the in-page agent can read: `.desc()` then `.init()`, which is the hook and returns what
   * `useState` returns. Writes need `set: true` and go through the generated `set<Name>` tool.
   */
  useState: <T extends AgentFieldType>(name: string | null, type: T, meta?: StStateMeta) => StStateDraft<T>;
  /** A read-only derived value the agent can read while the component is mounted: `.desc()` then `.value()`. */
  expose: <T extends AgentFieldType>(name: string | null, type: T, meta?: StExposeMeta) => StExposeDraft<T>;
  /**
   * A component tool: `.desc()`, then `.arg()` / `.opt()`, chained onto one `.exec()` hook.
   *
   * A falsy name declares the tool without publishing it — the callable still drives the click a person makes.
   * Every one of these ends in a hook, so a conditional surface withholds the name rather than skipping the chain.
   */
  tool: (name: string | null, meta?: StToolMeta) => StToolDraft;
}

const stAgentic: StAgentic = {
  useState: (name, type, meta) => new StStateDraft(name, type, meta),
  expose: (name, type, meta) => new StExposeDraft(name, type, meta),
  tool: (name, meta) => new StToolDraft(name, meta),
};

/** Idempotent — `StoreRegistry.build` runs once per merged root, always onto the one instance. */
export const attachAgentic = <T extends object>(instance: T): T & StAgentic => Object.assign(instance, stAgentic);
