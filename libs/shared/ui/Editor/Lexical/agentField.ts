"use client";
import { createContext, useContext } from "react";

import type { EditorFeature } from "./feature";

/**
 * What an editor plugin needs in order to publish a tool for the field it is editing.
 *
 * Every tool the editor offers is named after the same field — `set<Field>On<Model>`,
 * `read<Field>BlocksOn<Model>` — and every one of them has to write through the live editor rather than
 * the stored value, so that `HistoryPlugin` sees it, `OnChangePlugin` carries it, and
 * `ExternalValuePlugin`'s skip-while-focused guard cannot swallow it. Both facts belong to the editor,
 * not to any one plugin, so `AgentFieldPlugin` computes them once and every plugin — built-in or
 * injected through `plugins` — reads them from here instead of re-deriving the naming.
 *
 * A `name` of null is a field the agent cannot see. It is null for the whole mount or not at all:
 * `st.tool` freezes a tool's name at its first mount, so a name that arrives later never registers.
 */
export interface AgentField {
  /** The `set<Field>On<Model>` this editor writes, or null to publish nothing. */
  name: string | null;
  /** The `<Field>BlocksOn<Model>` root of the block read/edit pair, or null for a field too short to address by block. */
  blockBase: string | null;
  /** Every capability of this editor instance — the built-ins plus whatever `plugins` contributed. */
  features: readonly EditorFeature[];
  /** The live document, as stored JSON. */
  content: () => unknown;
  /** Runs `mutate` against the live editor and flushes the result to the store. */
  commit: (mutate: () => void) => Promise<void>;
}

const NO_AGENT_FIELD: AgentField = {
  name: null,
  blockBase: null,
  features: [],
  content: () => null,
  commit: () => Promise.resolve(),
};

const AgentFieldContext = createContext<AgentField>(NO_AGENT_FIELD);

export const AgentFieldProvider = AgentFieldContext.Provider;

/** Reads the ambient agent field; publishes nothing outside an editor that named one. */
export const useAgentField = (): AgentField => useContext(AgentFieldContext);
