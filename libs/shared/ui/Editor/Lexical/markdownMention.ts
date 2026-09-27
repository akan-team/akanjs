import type { TextMatchTransformer } from "@lexical/markdown";
import { RichEditor } from "@libs/shared/common";

import { recallMention } from "./mentionCache";
import { MentionNode } from "./nodes/MentionNode";
import { $createMentionNode, $isMentionNode } from "./nodes/mentionNode.util";

/**
 * `@[label](mention:refName/refId)` — the one way to write a mention in markdown.
 *
 * A mention had no markdown form at all, so an agent could neither write one nor rewrite a field holding
 * one. Giving it a token puts it in the same vocabulary as every other block: `set<Field>On<Model>` and
 * `edit<Field>BlocksOn<Model>` reach it with no new tool, and it can sit mid-sentence, which is the whole
 * point of a mention and is what a dedicated insert-at-block tool could never do.
 *
 * The grammar itself lives on `RichEditor`, because a write that never reaches a live editor — an agent
 * writing a row's body through the store — has to parse the same token. The `refId` comes from
 * `searchMentions`, which returns the token ready to paste.
 */

const TOKEN = RichEditor.mentionPattern;

export const mentionToken = RichEditor.mentionToken;

/**
 * Must sit **before** `LINK` in the transformer list. `findOutermostTextMatchTransformer` prefers the
 * outermost match, but its tie-break only replaces a found match when the new one starts earlier *and*
 * ends later; `@[x](mention:a/b)` and LINK's `[x](…)` end at the same index, so the comparison fails and
 * array order decides. Behind LINK, every mention would import as a link to `mention:a/b`.
 *
 * `href` and `imageUrl` are not in the token — they come back from `mentionCache`, which every
 * `$createMentionNode` fills. A cache miss still yields a working chip, just without the link and avatar.
 */
export const MENTION: TextMatchTransformer = {
  dependencies: [MentionNode],
  importRegExp: TOKEN,
  regExp: new RegExp(`${TOKEN.source}$`),
  replace: (textNode, match) => {
    const [, label, refName, refId] = match;
    textNode.replace(
      $createMentionNode(
        recallMention(refName, refId) ?? { refName, refId, label: RichEditor.unescapeMentionLabel(label) },
      ),
    );
  },
  export: (node) => ($isMentionNode(node) ? mentionToken(node.getPayload()) : null),
  type: "text-match",
};
