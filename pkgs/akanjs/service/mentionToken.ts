export class MentionToken {
  //? A server twin of use-agentic's `Reference.pattern`, which the server may not import; keep the two in step.
  static readonly #pattern =
    /@\[((?:\\[\\[\]]|\\(?![\\[\]])|(?!@\[)[^\]\\])*)\]\(mention:([^/)[\]]+)\/([^#)[\]]+)(?:#([^)[\]]*))?\)/g;

  static in(text: string | undefined): boolean {
    return !!text?.includes("](mention:");
  }

  //? Security: a token's label is the record's title, which would read as the user's own words. The pointer names
  //? the same record, and the title reaches the model inside the fenced reference only.
  static unlabelled(text: string): string {
    return text.replace(MentionToken.#pattern, (_token, _label, refName: string, refId: string, path?: string) => {
      const pointer = `${refName}/${refId}${path ? `#${path}` : ""}`;
      return `@[${pointer}](mention:${pointer})`;
    });
  }
}
