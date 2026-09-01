import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { adapt } from "akanjs/service";
import type { DocCorpusEntry } from "./docCorpusEntry";

/**
 * The generated documentation corpus under `public/llms/pages`, read once and held in memory.
 *
 * `generateLlms.ts` writes one markdown file per docs route with a fixed header — `Source`, `Section`, `Category`,
 * `Priority` — so the corpus is already the index; nothing here re-derives it from the `.tsx` pages, which is what
 * keeps the two from disagreeing.
 *
 * Held rather than re-read because it is ~120 files that only change when the app is rebuilt, and because a tool
 * call should not pay a directory walk. The cache is a promise so concurrent first calls share one walk.
 */
export class DocCorpus extends adapt("docCorpus" as const, () => ({})) {
  #loaded: Promise<DocCorpusEntry[]> | null = null;

  async entries(): Promise<DocCorpusEntry[]> {
    this.#loaded ??= this.#load();
    return await this.#loaded;
  }

  /** Same resolution the web router uses for `public/`, so the corpus is found in dev and in a built app alike. */
  static #root() {
    return path.join(process.env.AKAN_APP_DIR ?? path.dirname(Bun.main), "public", "llms", "pages");
  }

  async #load(): Promise<DocCorpusEntry[]> {
    const root = DocCorpus.#root();
    const files = await this.#walk(root);
    const entries = await Promise.all(files.map(async (file) => this.#parse(await readFile(file, "utf8"))));
    const found = entries.filter((entry): entry is DocCorpusEntry => !!entry);
    if (!found.length)
      this.logger.warn(`No documentation pages under ${root}; run \`bun apps/akan/script/generateLlms.ts\`.`);
    return found.sort((a, b) => a.href.localeCompare(b.href));
  }

  async #walk(dir: string): Promise<string[]> {
    const found: string[] = [];
    // An app served without its generated corpus publishes an empty catalogue rather than failing to boot.
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) found.push(...(await this.#walk(full)));
      else if (item.name.endsWith(".md")) found.push(full);
    }
    return found;
  }

  /**
   * Reads the header the generator writes and the first prose paragraph after `## Content`.
   *
   * A page with no `Source:` line is not a page this owns — it is something else that landed in the folder — so it
   * is dropped rather than published under a guessed href.
   */
  #parse(markdown: string): DocCorpusEntry | null {
    const field = (name: string) => DocCorpus.#captured(new RegExp(`^- ${name}: (.+)$`, "m"), markdown);
    const href = field("Source");
    if (!href) return null;
    const title = DocCorpus.#captured(/^# (.+)$/m, markdown) || href;
    return {
      href,
      title,
      section: field("Section"),
      category: field("Category"),
      priority: field("Priority"),
      summary: DocCorpus.#summary(markdown.split("\n## Content\n")[1] ?? "", title),
      body: markdown,
    };
  }

  static #captured(pattern: RegExp, source: string) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: `exec` returns null when nothing matches, which is the ordinary case here — a page with no `Source:` line is what tells `#parse` the file is not one of ours.
    return pattern.exec(source)?.[1]?.trim() ?? "";
  }

  /**
   * The first paragraph that actually says something about the page.
   *
   * The generator opens `## Content` by repeating the page title, so taking the literal first paragraph gave every
   * summary as the title again — which is the one thing a list result already shows. Headings, list items, and
   * anything too short to be a sentence are skipped for the same reason: the summary exists so an agent can choose
   * between pages without reading them, and a summary that repeats the title chooses nothing.
   */
  static #summary(content: string, title: string) {
    return (
      content
        .split("\n\n")
        .map((paragraph) => paragraph.trim())
        .find(
          (paragraph) =>
            paragraph.length > 40 && paragraph !== title && !paragraph.startsWith("#") && !paragraph.startsWith("-"),
        ) ?? ""
    );
  }
}
