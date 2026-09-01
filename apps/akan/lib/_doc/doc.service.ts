import { DocCorpus, type DocCorpusEntry } from "@apps/akan/srvkit";
import { serve } from "akanjs/service";

import * as cnst from "../cnst";

export class DocService extends serve("doc" as const, ({ plug }) => ({
  corpus: plug(DocCorpus),
})) {
  /** Occurrences past this many say the page is about the word; counting further only rewards length. */
  private static readonly bodyWeightCap = 8;

  async listPages(section?: cnst.DocSection["value"] | null) {
    const entries = await this.corpus.entries();
    return entries.filter((entry) => !section || entry.section === section).map((entry) => DocService.page(entry));
  }

  async readPage(href: string) {
    const entries = await this.corpus.entries();
    return entries.find((entry) => entry.href === href)?.body ?? null;
  }

  /**
   * Ranks by where the words hit and how much the page is about them.
   *
   * A title match and a body mention are not the same answer — a page titled "akanjs/signal" is what somebody
   * searching "signal" wants, and the dozens that merely say the word would otherwise bury it. Body hits are
   * counted rather than merely noticed for the same reason one step down: without a count every body-only match
   * ties, and a tie sorts alphabetically, which is a ranking nobody asked for.
   */
  async searchPages(text: string, limit?: number | null) {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const entries = await this.corpus.entries();
    return entries
      .map((entry) => ({ entry, score: DocService.score(entry, words) }))
      .filter(({ score }) => score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          // Still tied means the words fall the same way in both, so prefer the one the docs put earlier in the
          // reading order — that is the generator's judgement about which page is central.
          a.entry.priority.localeCompare(b.entry.priority) ||
          a.entry.href.localeCompare(b.entry.href),
      )
      .slice(0, limit ?? 20)
      .map(({ entry }) => DocService.page(entry));
  }

  private static score(entry: DocCorpusEntry, words: string[]) {
    const title = `${entry.title} ${entry.category}`.toLowerCase();
    const body = entry.body.toLowerCase();
    // Every word must appear somewhere, so adding a word narrows the result rather than widening it.
    if (!words.every((word) => body.includes(word) || title.includes(word))) return 0;
    return words.reduce(
      (total, word) =>
        total + (title.includes(word) ? 10 : 0) + Math.min(body.split(word).length - 1, DocService.bodyWeightCap),
      0,
    );
  }

  private static page(entry: DocCorpusEntry) {
    return new cnst.DocPage({
      href: entry.href,
      title: entry.title,
      section: (entry.section || "docs") as cnst.DocSection["value"],
      category: entry.category,
      priority: (entry.priority || "P2") as cnst.DocPriority["value"],
      summary: entry.summary,
    });
  }
}
