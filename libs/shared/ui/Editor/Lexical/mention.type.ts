import type { ComponentType } from "react";

/** One selectable row in the mention menu — a single document of a domain model. */
export interface MentionCandidate {
  refId: string;
  /** Display name without the leading `@`. Stored on the node as a snapshot. */
  label: string;
  description?: string;
  imageUrl?: string;
  /** Overrides `MentionSource.hrefOf` for this candidate. */
  href?: string;
}

export interface MentionPickerProps {
  onSelect: (candidate: MentionCandidate) => void;
  onClose: () => void;
}

/**
 * A mentionable domain model, contributed by the lib/app that owns it through
 * `mentionEditorPlugin`. The editor never imports a domain module: it receives a
 * `refName`, a way to search, and a way to build a link, all in plain values.
 */
export interface MentionSource {
  /** Stored on the node to identify the model — `"admin"`, `"user"`, … */
  refName: string;
  /** Menu group heading, and the `/<label>` slash entry once M3 lands. */
  label: string;
  /** Extra slash/menu search terms beyond `label`. */
  keywords?: string[];
  /** Skip this source until the query is at least this long. Defaults to 0. */
  minQueryLength?: number;
  search: (query: string, signal: AbortSignal) => Promise<MentionCandidate[]>;
  hrefOf?: (candidate: MentionCandidate) => string;
  /**
   * Query zone for models too large for a five-row typeahead: a full picker with
   * the source's own filters and pagination. When present, the `/<label>` slash
   * entry opens this instead of scoping the `@` menu. `@` still searches inline.
   */
  Picker?: ComponentType<MentionPickerProps>;
}
