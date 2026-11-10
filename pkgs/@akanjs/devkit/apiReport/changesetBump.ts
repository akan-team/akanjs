export type Bump = "major" | "minor" | "patch";

export class ChangesetBump {
  static readonly #rank: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };
  static readonly #entry = /^\s*(["']?)([^"'#:\s][^"'#:]*?)\1\s*:\s*(["']?)(major|minor|patch)\3\s*(?:#.*)?$/;

  static of(text: string, packageName: string): Bump | null {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ""))?.[1] ?? "";
    for (const line of frontmatter.split(/\r?\n/)) {
      const match = ChangesetBump.#entry.exec(line);
      if (match?.[2] === packageName) return match[4] as Bump;
    }
    return null;
  }

  static atLeast(bump: Bump | null, floor: Bump) {
    return bump !== null && ChangesetBump.#rank[bump] >= ChangesetBump.#rank[floor];
  }
}
