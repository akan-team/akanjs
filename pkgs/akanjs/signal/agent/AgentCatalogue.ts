import { mcpBaseVerbOf } from "akanjs/common";
import { FetchClient } from "akanjs/fetch";
import type { SerializedEndpoint, SerializedSignal, SerializedSlice } from "../types";

/** Where an endpoint came from, which is what decides where an audience's opt-in for it can be written. */
export type AgentOrigin = "base" | "slice" | "endpoint";

/** Which generated CRUD verb a `base` candidate is. Its opt-in lives on the signal, not on the endpoint. */
export type AgentBaseVerb = NonNullable<ReturnType<typeof mcpBaseVerbOf>>;

/** One endpoint a signal registry holds, before any audience has decided anything about it. */
export interface AgentCandidate {
  refName: string;
  key: string;
  endpoint: SerializedEndpoint;
  origin: AgentOrigin;
  /** The signal it belongs to. A generated verb carries no option of its own, so its opt-in is written here. */
  signal: SerializedSignal;
  /** The slice this key was generated from, where the opt-in for a `slice` candidate is written. */
  slice?: SerializedSlice;
  baseVerb?: AgentBaseVerb;
}

/** An opt-in a catalogue did not honour, with the reason it did not. */
export interface AgentRefusal {
  key: string;
  reason: string;
}

/** A published entry carrying no description its author wrote, and what to write so that it does. */
export interface AgentUndescribed {
  key: string;
  reason: string;
}

export interface AgentCatalogueOptions {
  resolveDescription?: (key: string) => string | undefined;
  excludeSignals?: string[];
}

/**
 * The half of an agent catalogue that does not depend on who is asking.
 *
 * Enumerating what a signal registry holds, keeping that order stable, holding one name per entry, and resolving
 * the words a module wrote in its dictionary are the same work for every audience — an external MCP client, an
 * in-page agent driving the store, a transport that does not exist yet. What differs is only which option admits
 * an endpoint and what shape it is published in, and both of those stay with the audience that decides them.
 *
 * Separated while exactly one audience existed. The cost then is moving code between two files; the cost later is
 * telling two audiences apart inside one class that never expected a second.
 */
export class AgentCatalogue {
  /**
   * Everything a registry holds, in an order that does not move between boots: clients cache a catalogue, and an
   * LLM prompt cache keys on its exact text, so an order that depends on object iteration is a cache that misses.
   *
   * Every endpoint is listed, including ones no audience will take. Deciding is the caller's half.
   */
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

  /**
   * What opted in and was refused anyway. Collected rather than merely dropped so a server can say so at boot:
   * the rejections an audience makes are fail-closed by design, and an author whose deliberate opt-in vanished
   * from the catalogue otherwise has nowhere to look but the framework source.
   */
  readonly refusals: AgentRefusal[] = [];

  readonly #options: AgentCatalogueOptions;
  readonly #claimed = new Set<string>();
  /** Keyed so an entry read twice — once as a tool and again as a template — is reported once. */
  readonly #undescribedByKey = new Map<string, string>();

  constructor(options: AgentCatalogueOptions = {}) {
    this.#options = options;
  }

  /**
   * What is published with no description of its own. Description is the one field a model picks an entry by, so
   * one without it is a broken entry rather than an untidy one — and a source scanner cannot answer this: it
   * reads files, where an opt-in is visible only as a literal in a builder call and where the model `.desc()`
   * every generated entry borrows is not written as a description of the entry at all.
   */
  get undescribed(): AgentUndescribed[] {
    return [...this.#undescribedByKey].map(([key, reason]) => ({ key, reason }));
  }

  /**
   * Takes the name for this entry, or refuses it because something else already holds it.
   *
   * A name must be unique within a catalogue, across every kind of entry it publishes. Keys are globally unique
   * by construction, so a collision means two signals disagree — the first in candidate order keeps it, which is
   * what makes the catalogue the same on the next boot either way.
   */
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
   * Every entry the framework generates borrows the model's own words, because none of them has any of its own.
   *
   * `slice()` generates the root slice under the empty key and `baseSliceDictionary` fills its text, so
   * `<model>List` and `<model>Insight` publish as "Slice List - Universal" whatever the dictionary says. The five
   * base CRUD entries are no better off: `getBaseSignalDictionary` writes "Get Banner" as both title and
   * description, and both are assigned last, so a module author has nowhere to write over either one.
   *
   * That matters more here than anywhere else — description is the one field a model picks an entry by, and "Get
   * Banner" says nothing about what a Banner is. So the model's `.desc()` is appended rather than substituted:
   * on `removeBanner` a bare model description would read as if the tool returned one. And when the model has no
   * `.desc()` either, the entry is recorded as undescribed — its only possible text is missing, and that is the
   * one thing a source scanner cannot see.
   */
  entryTexts(refName: string, key: string) {
    const borrowed = `its only text is the model's own, and \`${refName}\` has no \`.desc()\` to lend it.`;
    if (key === `${refName}List` || key === `${refName}Insight`) {
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
