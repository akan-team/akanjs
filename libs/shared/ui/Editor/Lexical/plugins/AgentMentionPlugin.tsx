"use client";
import { st } from "@libs/shared/client";

import { useAgentField } from "../agentField";
import { mentionToken } from "../markdownMention";
import type { MentionSource } from "../mention.type";
import { rememberMention } from "../mentionCache";
import { toMentionPayload } from "./mentionPlugin.util";

/** Enough for the agent to recognise the right one, few enough that a large model cannot flood the turn. */
const ROWS = 8;

const SEARCH_TIMEOUT_MS = 10_000;

interface AgentMentionPluginProps {
  sources: readonly MentionSource[];
}

/**
 * Lets the agent look up a mentionable document and hands back the markdown token for it.
 *
 * Searching is the only part a mention needs a tool for. Insertion goes through the field's own
 * `set<Field>On<Model>` / `edit<Field>BlocksOn<Model>` because `MENTION` puts the chip in the markdown
 * vocabulary — which is also what lets a mention land mid-sentence, where it belongs, instead of at a
 * block boundary an insert tool would be stuck with.
 *
 * One `searchMentions` for the whole page rather than one per field: it reads no editor state, so every
 * mounted editor's registration is interchangeable. `refName` therefore carries no `oneOf` — a tool's
 * parameters freeze at its first mount, and a second editor with a different source set would be answered
 * from a stale list. The names go in the description instead, and `exec` names the live set when it is
 * asked for one it does not have. Two editors whose sources differ therefore describe the tool differently,
 * which is what the surface warns on.
 */
export const AgentMentionPlugin = ({ sources }: AgentMentionPluginProps) => {
  const { name } = useAgentField();
  const refNames = sources.map((source) => source.refName).join(", ");

  st.tool(name && sources.length ? "searchMentions" : null, { settle: false })
    .desc(
      [
        `Find a document to mention. Models: ${refNames}.`,
        "Returns one `@[label](mention:model/id)` token per match — paste a token verbatim into this field's",
        "markdown to place the mention, anywhere in a sentence.",
      ].join(" "),
    )
    .arg("refName", String)
    .arg("query", String)
    .exec(async (refName, query) => {
      const source = sources.find((candidate) => candidate.refName === refName);
      if (!source) return `There is no "${refName}" to mention here. Models: ${refNames}.`;
      const candidates = await source.search(query, AbortSignal.timeout(SEARCH_TIMEOUT_MS));
      if (!candidates.length) return `No ${source.label} matches "${query}".`;
      return candidates
        .slice(0, ROWS)
        .map((candidate) => {
          const payload = toMentionPayload(source, candidate);
          // The token carries no href or avatar, so the resolved payload is banked here for the write
          // that follows. Nothing else would know them: this search is where the source resolved them.
          rememberMention(payload);
          const token = mentionToken(payload);
          return candidate.description ? `${token} — ${candidate.description}` : token;
        })
        .join("\n");
    });
  return null;
};
