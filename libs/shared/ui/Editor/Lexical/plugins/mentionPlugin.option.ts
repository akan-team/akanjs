import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";

import type { MentionCandidate, MentionSource } from "../mention.type";

/** One mention menu row: a candidate paired with the source that produced it. */
export class MentionOption extends MenuOption {
  readonly source: MentionSource;
  readonly candidate: MentionCandidate;

  constructor(source: MentionSource, candidate: MentionCandidate) {
    super(`${source.refName}:${candidate.refId}`);
    this.source = source;
    this.candidate = candidate;
  }
}
