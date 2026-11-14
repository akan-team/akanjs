import { createHash } from "node:crypto";
import { InlineToken } from "../common/inlineToken";

export interface MentionPointer {
  refName: string;
  refId: string;
  path?: string;
}

export class MentionToken {
  //? A server twin of use-agentic's `Reference.pattern`, which the server may not import; keep the two in step.
  static readonly #pattern =
    /@\[((?:\\[\\[\]]|\\(?![\\[\]])|(?!@\[)[^\]\\])*)\]\(mention:([^/)[\]]+)\/([^#)[\]]+)(?:#([^)[\]]*))?\)/g;

  static in(text: string | undefined): boolean {
    return !!text?.includes("](mention:");
  }

  static pointerOf({ refName, refId, path }: MentionPointer): string {
    return `${refName}/${refId}${path ? `#${path}` : ""}`;
  }

  //? Security: an id or a path is whatever the app's reference source returns, and a slug is drawn from the record's
  //? title. One that is no token is named by a digest in the user's words, and spelled inside the fenced reference.
  //? A digest, not a count: a count would name another record once a compaction drops the messages before it.
  static nameOf(pointer: MentionPointer): string {
    const spelled = MentionToken.pointerOf(pointer);
    const { refName, refId, path } = pointer;
    if ([refName, refId, ...(path ? [path] : [])].every(InlineToken.is)) return spelled;
    return `ref-${createHash("sha256").update(spelled).digest("hex").slice(0, 8)}`;
  }

  static pointersIn(text: string): MentionPointer[] {
    return [...text.matchAll(MentionToken.#pattern)].map(([, , refName = "", refId = "", path]) => ({
      refName,
      refId,
      ...(path ? { path } : {}),
    }));
  }

  //? Security: a token's label is the record's title, which would read as the user's own words. The pointer names
  //? the same record, and the title reaches the model inside the fenced reference only.
  static unlabelled(text: string): string {
    return text.replace(MentionToken.#pattern, (_token, _label, refName: string, refId: string, path?: string) => {
      const name = MentionToken.nameOf({ refName, refId, ...(path ? { path } : {}) });
      return `@[${name}](mention:${name})`;
    });
  }
}
