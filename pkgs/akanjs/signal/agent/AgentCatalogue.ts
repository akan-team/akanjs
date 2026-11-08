import { mcpBaseVerbOf, sliceNames } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import type { SerializedEndpoint, SerializedSignal, SerializedSlice } from "../types";

export type AgentOrigin = "base" | "slice" | "endpoint";

export type AgentBaseVerb = NonNullable<ReturnType<typeof mcpBaseVerbOf>>;

export interface AgentCandidate {
  refName: string;
  key: string;
  endpoint: SerializedEndpoint;
  origin: AgentOrigin;
  /** Where a generated verb's opt-in is written, since it carries no option of its own. */
  signal: SerializedSignal;
  /** Where a `slice` candidate's opt-in is written. */
  slice?: SerializedSlice;
  baseVerb?: AgentBaseVerb;
}

export interface AgentRefusal {
  key: string;
  reason: string;
}

export interface AgentUndescribed {
  key: string;
  reason: string;
}

export interface AgentCatalogueOptions {
  resolveDescription?: (key: string) => string | undefined;
  excludeSignals?: string[];
}

/** The audience-independent half of a catalogue: enumeration, stable order, one name per entry, dictionary text. */
export class AgentCatalogue {
  /** Sorted, because clients cache a catalogue and an LLM prompt cache keys on its exact text. */
  static candidates(
    serializedSignal: Record<string, SerializedSignal>,
    { excludeSignals = ["base"] }: { excludeSignals?: string[] } = {},
  ): AgentCandidate[] {
    const excluded = new Set(excludeSignals);
    const candidates: AgentCandidate[] = [];
    for (const [refName, signal] of Object.entries(serializedSignal)) {
      if (excluded.has(refName)) continue;
      for (const [key, endpoint] of Object.entries(FetchClient.getBaseEndpoint(refName, signal))) {
        const baseVerb = mcpBaseVerbOf(refName, key);
        if (baseVerb) candidates.push({ refName, key, endpoint, origin: "base", signal, baseVerb });
      }
      for (const [suffix, slice] of Object.entries(signal.slice ?? {})) {
        for (const [key, endpoint] of Object.entries(FetchClient.getEndpointFromSlice(refName, suffix, slice)))
          candidates.push({ refName, key, endpoint, origin: "slice", signal, slice });
      }
      for (const [key, endpoint] of Object.entries(signal.endpoint))
        candidates.push({ refName, key, endpoint, origin: "endpoint", signal });
    }
    return candidates.sort((a, b) => a.refName.localeCompare(b.refName) || a.key.localeCompare(b.key));
  }

  readonly refusals: AgentRefusal[] = [];

  readonly #options: AgentCatalogueOptions;
  readonly #claimed = new Set<string>();
  // Keyed so an entry read as a tool and again as a template is reported once.
  readonly #undescribedByKey = new Map<string, string>();

  constructor(options: AgentCatalogueOptions = {}) {
    this.#options = options;
  }

  get undescribed(): AgentUndescribed[] {
    return [...this.#undescribedByKey].map(([key, reason]) => ({ key, reason }));
  }

  /** The first claimant in candidate order keeps a colliding name, so the catalogue is the same every boot. */
  claim(key: string): boolean {
    if (this.#claimed.has(key)) {
      this.refuse(key, "another endpoint is already published under this name.");
      return false;
    }
    this.#claimed.add(key);
    return true;
  }

  refuse(key: string, reason: string) {
    this.refusals.push({ key, reason });
  }

  texts(titleKey: string, descKey = `${titleKey}.desc`) {
    const title = this.#options.resolveDescription?.(titleKey);
    const description = this.#options.resolveDescription?.(descKey);
    return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
  }

  /**
   * Generated entries borrow the model's words: the root slice's placeholder text and the base CRUD "Get X" are
   * assigned last, where no author can write over them. On CRUD the model `.desc()` is appended, not substituted,
   * so `removeX` does not read as returning one.
   */
  entryTexts(refName: string, key: string) {
    const borrowed = `its only text is the model's own, and \`${refName}\` has no \`.desc()\` to lend it.`;
    const { list, insight } = sliceNames(refName).endpoint;
    if (key === list || key === insight) {
      const texts = this.texts(`${refName}.modelName`, `${refName}.modelDesc`);
      if (!texts.description) this.#undescribedByKey.set(key, borrowed);
      return texts;
    }
    const texts = this.texts(`${refName}.signal.${key}`);
    if (!mcpBaseVerbOf(refName, key)) {
      if (!texts.description)
        this.#undescribedByKey.set(key, "it has no dictionary `.desc()`, so an agent has its name and nothing else.");
      return texts;
    }
    const modelDesc = this.#options.resolveDescription?.(`${refName}.modelDesc`);
    if (!modelDesc) this.#undescribedByKey.set(key, borrowed);
    const generated = texts.description ?? texts.title;
    return modelDesc ? { ...texts, description: generated ? `${generated} — ${modelDesc}` : modelDesc } : texts;
  }
}
