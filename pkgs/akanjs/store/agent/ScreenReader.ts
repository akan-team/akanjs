const skipTags = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "IFRAME",
  "SVG",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "OBJECT",
  "EMBED",
]);
const headingLevels = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 } as const;
const headingSelector = "h1, h2, h3, h4, h5, h6";
const blockTags = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "HEADER",
  "HR",
  "LEGEND",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "UL",
]);

/**
 * Serializes what the page is rendering into compact text an agent can answer questions from: headings keep their
 * level and their anchor, links keep their href, controls keep their value and `data-akan-*` annotation. The
 * agent's own UI is marked `data-agent-ui` and skipped, so a turn never re-reads its own transcript, and a
 * password value is never read — the screen shows dots, so the DOM holds more than the user sees.
 *
 * A region the app marks `data-agent-skip` — what `Agent.Skip` renders — costs a `[skipped: <name>]` line instead
 * of its text. It stands in the output rather than vanishing because a deleted region reads as an absent one, and
 * an agent asked about a footer it never saw answers that the page has none. Naming the region as `section` reads
 * it: the marker is what the default read leaves out, not a wall.
 *
 * A heading carries `(#anchor)` whenever it opens a container that has an id or a scope path, because that is the
 * name `readScreen({ section })` and `highlight` take: printing the text without the name leaves an agent
 * guessing at a slug. For the same reason a truncated read ends with the headings below the cut instead of only
 * a character count — otherwise everything past the limit is unreachable, since nothing names it.
 */
export class ScreenReader {
  static readonly limit = 8000;

  static read(root?: HTMLElement | null): string {
    if (typeof document === "undefined") return "No rendered document is available.";
    const reader = new ScreenReader();
    const title = document.title.trim();
    if (title) reader.#lines.push(`Page: ${title}`);
    reader.#walk(root ?? document.body, true);
    reader.#flush();
    return reader.#text() || "The page is rendering nothing readable.";
  }

  /**
   * One heading's own section: the heading, then what follows it until the next heading of the same level or
   * higher. Reads the heading's container when the heading is the only one in it — the shape a docs slide or an
   * `<article>` has — and otherwise the heading's own following siblings.
   */
  static readFrom(heading: HTMLElement, root?: HTMLElement | null): string {
    if (typeof document === "undefined") return "No rendered document is available.";
    const reader = new ScreenReader();
    const container = ScreenReader.#sectionOf(heading, root);
    if (container) reader.#walk(container, true);
    else {
      const level = headingLevels[heading.tagName.toUpperCase() as keyof typeof headingLevels] ?? 1;
      reader.#walk(heading, true);
      let next = heading.nextElementSibling;
      while (next && !ScreenReader.#stops(next, level)) {
        reader.#walk(next);
        next = next.nextElementSibling;
      }
    }
    reader.#flush();
    return reader.#text() || "That section is rendering nothing readable.";
  }

  /**
   * The outermost ancestor that still holds this heading and no other of its level — the section, not the title
   * wrapper inside it. Climbing matters: a docs slide puts its heading two or three divs down, so the innermost
   * match is often the heading and nothing else.
   */
  static #sectionOf(heading: HTMLElement, root?: HTMLElement | null): HTMLElement | null {
    const level = headingLevels[heading.tagName.toUpperCase() as keyof typeof headingLevels] ?? 1;
    const boundary = root ?? document.body;
    let container: HTMLElement | null = null;
    let parent = heading.parentElement;
    for (let depth = 0; parent && parent !== boundary && depth < 6; depth += 1) {
      const owned = [...parent.querySelectorAll(headingSelector)].filter((found) => ScreenReader.#stops(found, level));
      if (owned.length !== 1) break;
      container = parent;
      parent = parent.parentElement;
    }
    return container;
  }

  /** The anchor a heading is addressable by: its own id, or the id or scope path of the container it opens. */
  static anchorOf(heading: HTMLElement): string {
    if (heading.id) return heading.id;
    let parent = heading.parentElement;
    for (let depth = 0; parent && depth < 4; depth += 1) {
      const name = parent.getAttribute("data-agent-scope") ?? parent.getAttribute("data-agent-zone") ?? parent.id;
      if (name && parent.querySelector(headingSelector) === heading) return name;
      parent = parent.parentElement;
    }
    return "";
  }

  /**
   * `checkVisibility()` reports whether the element has a layout box, and a `display: contents` wrapper has none
   * while its children do — so Chrome answers false for a wrapper the user is looking straight at, and skipping it
   * would drop that whole subtree (happy-dom answers true, so no DOM test sees the difference). Reading through it
   * is safe only because the walk is top-down: a `display: none` ancestor bails on its own computed display first.
   */
  static #rendered(el: HTMLElement) {
    if (typeof el.checkVisibility !== "function" || el.checkVisibility()) return true;
    return getComputedStyle(el).display === "contents";
  }

  static #stops(el: Element, level: number) {
    const found = headingLevels[el.tagName.toUpperCase() as keyof typeof headingLevels];
    return !!found && found <= level;
  }

  #lines: string[] = [];
  #headings: string[] = [];
  #buffer = "";
  #length = 0;

  /**
   * Past the walk budget the text is dropped but the headings are not: a section below the cut is exactly what the
   * truncation note owes the reader, and it is the only way that part of the screen can be named at all.
   */
  #outline(node: Node): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (skipTags.has(tag) || el.hasAttribute("data-agent-ui") || el.hasAttribute("data-agent-skip")) return;
    const level = headingLevels[tag as keyof typeof headingLevels];
    if (level) {
      const anchor = ScreenReader.anchorOf(el);
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) this.#headings.push(`${"#".repeat(level)} ${text}${anchor ? ` (#${anchor})` : ""}`);
      return;
    }
    for (const child of el.childNodes) this.#outline(child);
  }

  #text() {
    const text = this.#lines.join("\n").trim();
    if (text.length <= ScreenReader.limit) return text;
    const kept = text.slice(0, ScreenReader.limit);
    const below = this.#headings.filter((heading) => !kept.includes(heading)).slice(0, 25);
    const note = `… [truncated ${text.length - ScreenReader.limit} more characters]`;
    return below.length
      ? `${kept}${note}\nFurther down, unread: ${below.join(" · ")}. Pass one of those names as \`section\` to read it.`
      : `${kept}${note}`;
  }

  /** What stands where a skipped region was: its own name, and the anchor `section` takes to read it on request. */
  #mark(el: HTMLElement, label: string) {
    const anchor = el.getAttribute("data-agent-scope") ?? el.getAttribute("data-agent-zone") ?? el.id;
    this.#flush();
    this.#buffer = `[skipped: ${label || el.tagName.toLowerCase()}${anchor ? ` (#${anchor})` : ""}]`;
    this.#flush();
  }

  #walk(node: Node, isRoot = false): void {
    if (this.#length > ScreenReader.limit * 2) {
      this.#outline(node);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text.trim()) this.#buffer += text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (skipTags.has(tag)) return;
    if (el.hasAttribute("data-agent-ui") || el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true")
      return;
    if (!ScreenReader.#rendered(el)) return;
    // Read past the marker only when the region is what was asked for: `section` naming it is that ask.
    const skipped = isRoot ? null : el.getAttribute("data-agent-skip");
    if (skipped !== null) {
      this.#mark(el, skipped);
      return;
    }
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      this.#control(el, tag);
      return;
    }
    if (tag === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt) this.#buffer += ` [image: ${alt}]`;
      return;
    }
    if (tag === "BR") {
      this.#flush();
      return;
    }
    if (tag === "PRE") {
      this.#pre(el);
      return;
    }
    if (tag === "A") {
      this.#anchor(el);
      return;
    }
    if (tag === "BUTTON" || el.getAttribute("role") === "button") {
      this.#button(el);
      return;
    }
    const level = headingLevels[tag as keyof typeof headingLevels];
    if (level) {
      this.#flush();
      this.#walkChildren(el);
      const anchor = ScreenReader.anchorOf(el);
      if (anchor) this.#buffer += ` (#${anchor})`;
      const before = this.#lines.length;
      this.#flush(`${"#".repeat(level)} `);
      if (this.#lines.length > before) this.#headings.push(this.#lines[this.#lines.length - 1]);
      return;
    }
    if (tag === "LI") {
      this.#flush();
      this.#walkChildren(el);
      this.#flush("- ");
      return;
    }
    if (tag === "TD" || tag === "TH") {
      if (this.#buffer.trim()) this.#buffer += " |";
      this.#walkChildren(el);
      return;
    }
    if (blockTags.has(tag)) {
      this.#flush();
      this.#walkChildren(el);
      this.#flush();
      return;
    }
    this.#walkChildren(el);
  }

  #walkChildren(el: HTMLElement) {
    for (const child of el.childNodes) this.#walk(child);
  }

  #anchor(el: HTMLElement) {
    const href = el.getAttribute("href") ?? "";
    const before = this.#buffer;
    this.#walkChildren(el);
    const text = this.#buffer.slice(before.length).replace(/\s+/g, " ").trim();
    if (href && href !== "#" && !href.startsWith("javascript:") && text !== href) this.#buffer += ` (${href})`;
  }

  /**
   * A control the person cannot use publishes no tool, so saying so here is what turns a silent refusal into a
   * fact the agent could have read. It reads `aria-disabled` too: a styled-off div carries no native property.
   */
  static #off(el: HTMLElement) {
    const native = (el as HTMLInputElement | HTMLButtonElement).disabled;
    return native || el.getAttribute("aria-disabled") === "true" ? " (disabled)" : "";
  }

  #button(el: HTMLElement) {
    const before = this.#buffer;
    this.#walkChildren(el);
    const inner = this.#buffer.slice(before.length).replace(/\s+/g, " ").trim();
    this.#buffer = before;
    const label = inner || el.getAttribute("aria-label") || "";
    const action = el.getAttribute("data-akan-action");
    if (label || action) this.#buffer += ` [button${ScreenReader.#off(el)}: ${label}${action ? ` → ${action}` : ""}]`;
  }

  #control(el: HTMLElement, tag: string) {
    const input = el as HTMLInputElement;
    const type = (el.getAttribute("type") ?? (tag === "INPUT" ? "text" : tag.toLowerCase())).toLowerCase();
    if (type === "hidden") return;
    const name =
      el.getAttribute("data-akan-state") ??
      el.getAttribute("aria-label") ??
      el.getAttribute("placeholder") ??
      el.getAttribute("name") ??
      type;
    const off = ScreenReader.#off(el);
    if (type === "password") {
      this.#buffer += ` [input ${name}${off}]`;
      return;
    }
    if (type === "checkbox" || type === "radio") {
      this.#buffer += ` [${type} ${name}${off}: ${input.checked ? "on" : "off"}]`;
      return;
    }
    const raw =
      tag === "SELECT"
        ? ((el as unknown as HTMLSelectElement).selectedOptions?.[0]?.textContent ??
          (el as unknown as HTMLSelectElement).value)
        : input.value;
    const value = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    this.#buffer += ` [${tag === "SELECT" ? "select" : "input"} ${name}${off}: ${JSON.stringify(value)}]`;
  }

  #pre(el: HTMLElement) {
    this.#flush();
    const raw = (el.textContent ?? "").trim();
    if (!raw) return;
    const rows = raw.split("\n");
    this.#lines.push(
      "```",
      ...rows.slice(0, 30),
      ...(rows.length > 30 ? [`… ${rows.length - 30} more lines`] : []),
      "```",
    );
    this.#length += raw.length;
  }

  #flush(prefix = "") {
    const text = this.#buffer.replace(/\s+/g, " ").trim();
    this.#buffer = "";
    if (!text) return;
    this.#lines.push(prefix + text);
    this.#length += prefix.length + text.length;
  }
}
