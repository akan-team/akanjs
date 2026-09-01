import { describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { SerializedSignal } from "../types";
import { AgentCatalogue } from "./AgentCatalogue";

class AgentNoteInput extends via((field) => ({ title: field(String) })) {}
class AgentNoteObject extends via(AgentNoteInput, (field) => ({ views: field(Int, { default: 0 }) })) {}
class LightAgentNote extends via(AgentNoteObject, ["title"] as const, () => ({})) {}
class AgentNote extends via(AgentNoteObject, LightAgentNote, () => ({})) {}
class AgentNoteInsight extends via(AgentNote, () => ({})) {}
ConstantRegistry.buildModel(
  "agentNote",
  AgentNoteInput,
  AgentNoteObject,
  AgentNote,
  LightAgentNote,
  AgentNoteInsight,
  {},
);

const signal = (): Record<string, SerializedSignal> => ({
  agentNote: {
    prefix: "agentNote",
    getGuards: ["Public"],
    cruGuards: ["Admin"],
    slice: { "": { args: [], guards: ["Public"] }, byAuthor: { args: [], guards: ["Public"] } },
    endpoint: { archiveAgentNote: { type: "mutation", args: [], returns: { refName: "Boolean" }, guards: ["Admin"] } },
  },
  base: { prefix: "base", slice: {}, endpoint: { ping: { type: "query", args: [], returns: { refName: "String" } } } },
});

const keysOf = (options?: { excludeSignals?: string[] }) =>
  AgentCatalogue.candidates(signal(), options).map((candidate) => candidate.key);

describe("AgentCatalogue candidates", () => {
  test("lists every endpoint a registry holds, whatever any audience would take", () => {
    // Nothing in this fixture opts into anything. Enumeration is not admission — an audience decides that, and it
    // cannot decide about a candidate it was never shown.
    const keys = keysOf();
    expect(keys).toContain("agentNote");
    expect(keys).toContain("lightAgentNote");
    expect(keys).toContain("createAgentNote");
    expect(keys).toContain("agentNoteList");
    expect(keys).toContain("agentNoteListByAuthor");
    expect(keys).toContain("archiveAgentNote");
  });

  test("tells a candidate's origin, because that is where an opt-in for it can be written", () => {
    const byKey = new Map(AgentCatalogue.candidates(signal()).map((candidate) => [candidate.key, candidate]));
    // A generated CRUD endpoint has no option of its own, so the verb names where the signal writes one.
    expect(byKey.get("createAgentNote")).toMatchObject({ origin: "base", baseVerb: "create" });
    expect(byKey.get("agentNote")).toMatchObject({ origin: "base", baseVerb: "get" });
    expect(byKey.get("agentNoteListByAuthor")?.origin).toBe("slice");
    expect(byKey.get("agentNoteListByAuthor")?.slice).toBeDefined();
    expect(byKey.get("archiveAgentNote")).toMatchObject({ origin: "endpoint" });
  });

  test("orders identically on every walk, because a catalogue is cached by whoever reads it", () => {
    // A client caches the list and an LLM prompt cache keys on its exact text, so an order that follows object
    // iteration is a cache that misses for no reason.
    expect(keysOf()).toEqual(keysOf());
    expect([...keysOf()].sort()).toEqual(keysOf());
  });

  test("drops the framework's own signal by default and takes an explicit list instead", () => {
    expect(keysOf()).not.toContain("ping");
    expect(keysOf({ excludeSignals: [] })).toContain("ping");
    expect(keysOf({ excludeSignals: ["agentNote"] })).toEqual(["ping"]);
  });
});

describe("AgentCatalogue naming", () => {
  test("gives a name to the first claimant and refuses the second by name", () => {
    const catalogue = new AgentCatalogue();
    expect(catalogue.claim("agentNote")).toBe(true);
    expect(catalogue.claim("agentNote")).toBe(false);
    expect(catalogue.refusals).toEqual([
      { key: "agentNote", reason: "another endpoint is already published under this name." },
    ]);
  });

  test("records a refusal an audience makes for its own reasons", () => {
    const catalogue = new AgentCatalogue();
    catalogue.refuse("archiveAgentNote", "it declares no guards.");
    expect(catalogue.refusals).toEqual([{ key: "archiveAgentNote", reason: "it declares no guards." }]);
  });
});

describe("AgentCatalogue texts", () => {
  const dictionary: Record<string, string> = {
    "agentNote.modelName": "Note",
    "agentNote.modelDesc": "A note somebody left on a record.",
    "agentNote.signal.archiveAgentNote": "Archive Note",
    "agentNote.signal.archiveAgentNote.desc": "Files the note out of the active list.",
  };
  const catalogueOf = () => new AgentCatalogue({ resolveDescription: (key) => dictionary[key] });

  test("reads a custom endpoint's own words", () => {
    expect(catalogueOf().entryTexts("agentNote", "archiveAgentNote")).toEqual({
      title: "Archive Note",
      description: "Files the note out of the active list.",
    });
  });

  test("lends the model's words to a generated entry that has none of its own", () => {
    // `<model>List` publishes as "Slice List - Universal" whatever the dictionary says, so the model's is the only
    // text there can be.
    expect(catalogueOf().entryTexts("agentNote", "agentNoteList")).toEqual({
      title: "Note",
      description: "A note somebody left on a record.",
    });
  });

  test("appends the model description to a generated verb rather than replacing it", () => {
    // On `removeAgentNote` a bare model description would read as if the tool returned one.
    const texts = catalogueOf().entryTexts("agentNote", "removeAgentNote");
    expect(texts.description).toBe("A note somebody left on a record.");
    expect(catalogueOf().undescribed).toEqual([]);
  });

  test("names what is published with no description anyone could have written", () => {
    const catalogue = new AgentCatalogue({ resolveDescription: () => undefined });
    catalogue.entryTexts("agentNote", "archiveAgentNote");
    catalogue.entryTexts("agentNote", "agentNoteList");
    expect(catalogue.undescribed).toEqual([
      { key: "archiveAgentNote", reason: "it has no dictionary `.desc()`, so an agent has its name and nothing else." },
      {
        key: "agentNoteList",
        reason: "its only text is the model's own, and `agentNote` has no `.desc()` to lend it.",
      },
    ]);
  });

  test("reports an entry once even when it is read as both a tool and a template", () => {
    const catalogue = new AgentCatalogue({ resolveDescription: () => undefined });
    catalogue.entryTexts("agentNote", "agentNoteList");
    catalogue.entryTexts("agentNote", "agentNoteList");
    expect(catalogue.undescribed).toHaveLength(1);
  });
});
