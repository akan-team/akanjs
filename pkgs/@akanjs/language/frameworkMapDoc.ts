import type { FrameworkFacet, FrameworkMap, FrameworkSite } from "akanjs/common/frameworkMap.ts";

const startMarker = "<!-- akan:framework-map:start -->";
const endMarker = "<!-- akan:framework-map:end -->";
const citedPattern = /`([A-Z][a-z][A-Za-z0-9]*)(?:[.#][\w$#]+)?(?:\(\))?`/g;

export class FrameworkMapDoc {
  static readonly regenerate = "bun run akan sync-architecture";

  static render(map: FrameworkMap, docDir: string): string {
    const nameOf = new Map(map.facets.map((facet) => [facet.id, facet.name]));
    const facets = [...map.facets].sort((a, b) => a.layer - b.layer || (a.id < b.id ? -1 : 1));
    const list = (names: string[]) => (names.length ? names.join(", ") : "—");
    const importsOf = (facet: FrameworkFacet, kind: "value" | "type") =>
      map.imports
        .filter(
          ({ from, value, type, dynamic }) =>
            from === facet.id && (kind === "value" ? value + dynamic > 0 : type > 0 && value + dynamic === 0),
        )
        .map(({ to, value }) => `\`${nameOf.get(to) ?? to}\`${kind === "value" && value === 0 ? " (lazy)" : ""}`);
    const lines = [
      startMarker,
      `<!-- Generated from the framework source by \`${FrameworkMapDoc.regenerate}\`. Edit outside the markers. -->`,
      "<!-- Outside the markers, every backticked PascalCase name must be a framework class or channel. -->",
      "",
      "## Facet layers",
      "",
      "A facet loads values only from facets in lower layers. A type-only import loads nothing, so it may point anywhere.",
      "",
      "| Layer | Facet | Loads values from | Imports only types from |",
      "| --- | --- | --- | --- |",
      ...facets.map(
        (facet) =>
          `| ${facet.layer} | \`${facet.name}\` | ${list(importsOf(facet, "value"))} | ${list(importsOf(facet, "type"))} |`,
      ),
      ...(map.cycles.length
        ? [
            "",
            `Facets that load values from each other: ${map.cycles.map((cycle) => cycle.map((id) => `\`${nameOf.get(id) ?? id}\``).join(" ⇄ ")).join("; ")}.`,
          ]
        : []),
      "",
      "## Process messages",
      "",
      "Each channel is a union of messages told apart by `type`. A sender writes the message's `type` literal; a handler",
      "branches on it or relays it. Both are named by the class or top-level function they sit in. A dash means no site",
      "was recognised.",
      ...map.channels.flatMap((channel) => {
        const declared = FrameworkMapDoc.#relative(docDir, channel.at.file);
        return [
          "",
          `### \`${channel.name}\`: ${channel.label}`,
          "",
          `Declared in [${declared}](${declared}).`,
          "",
          "| Message | Sent by | Handled by |",
          "| --- | --- | --- |",
          ...channel.messages.map(
            ({ type, senders, handlers }) =>
              `| \`${type}\` | ${FrameworkMapDoc.#owners(senders)} | ${FrameworkMapDoc.#owners(handlers)} |`,
          ),
        ];
      }),
      ...(map.missing.length ? ["", `Channels not found: ${map.missing.join("; ")}.`] : []),
      endMarker,
    ];
    return lines.join("\n");
  }

  static generatedOf(markdown: string): string | null {
    const start = markdown.indexOf(startMarker);
    const end = markdown.indexOf(endMarker, start);
    return start < 0 || end < 0 ? null : markdown.slice(start, end + endMarker.length);
  }

  static splice(markdown: string, generated: string): string {
    const current = FrameworkMapDoc.generatedOf(markdown);
    if (current !== null) return markdown.replace(current, () => generated);
    return `${markdown.trimEnd()}\n\n${generated}\n`;
  }

  static citedClasses(markdown: string): string[] {
    const current = FrameworkMapDoc.generatedOf(markdown);
    const handKept = current === null ? markdown : markdown.replace(current, "");
    return [...new Set([...handKept.matchAll(citedPattern)].map(([, name]) => name))].sort();
  }

  static unknownClasses(markdown: string, map: FrameworkMap): string[] {
    const known = new Set([
      ...map.facets.flatMap(({ classes }) => classes.map(({ name }) => name)),
      ...map.channels.map(({ name }) => name),
    ]);
    return FrameworkMapDoc.citedClasses(markdown).filter((name) => !known.has(name));
  }

  static #owners(sites: FrameworkSite[]) {
    return sites.length ? sites.map(({ owner }) => `\`${owner}\``).join(", ") : "—";
  }

  static #relative(fromDir: string, file: string) {
    const from = fromDir.split("/").filter(Boolean);
    const to = file.split("/").filter(Boolean);
    let shared = 0;
    while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
    return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
  }
}
