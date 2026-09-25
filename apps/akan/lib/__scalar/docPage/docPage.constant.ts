import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class DocSection extends enumOf("docSection", ["docs", "references", "conventions", "cheatsheet"] as const) {}

/** Reading order, as the docs generator assigns it: P0 is the path through the framework, P2 is reference detail. */
export class DocPriority extends enumOf("docPriority", ["P0", "P1", "P2"] as const) {}

export class DocPage extends via((field) => ({
  href: field(String, { example: "/references/akanjs/signal" }), // the docs route, and the id `readDocPage` takes
  title: field(String, { default: "" }),
  section: field(DocSection, { default: "docs" }),
  category: field(String, { default: "" }), // the menu group the page sits under, as a person reads it
  priority: field(DocPriority, { default: "P2" }),
  summary: field(String, { default: "" }), // first prose paragraph, so a list result is choosable without a read
})) {
  isEssential() {
    return this.priority === "P0";
  }

  /** Where the generator mirrored the page, which is also where a browser can fetch it unauthenticated. */
  mirrorHref() {
    return `/llms/pages${this.href}.md`;
  }
}
