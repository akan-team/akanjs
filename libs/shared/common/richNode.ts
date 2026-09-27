import type { MentionTarget } from "./richEditor";

export class RichNode {
  static readonly mentionType = "akan-mention";

  static root(children: object[]) {
    return { root: { type: "root", format: "", indent: 0, version: 1, direction: null, children } };
  }

  static text(text: string, format = 0) {
    return { type: "text", text, format, detail: 0, mode: "normal", style: "", version: 1 };
  }

  // No href: the token grammar carries none, and a synthesized `/<refName>/<id>` pointed at a route per
  // model that most apps do not have. A chip built from text is a reference; only a mention source links.
  static mention({ refName, id, name }: MentionTarget) {
    return {
      type: RichNode.mentionType,
      text: `@${name}`,
      refName,
      refId: id,
      label: name,
      format: 0,
      detail: 1,
      mode: "token",
      style: "",
      version: 1,
    };
  }

  static paragraph(children: object[]) {
    return { type: "paragraph", format: "", indent: 0, version: 1, direction: null, children };
  }

  static block(type: string, children: object[], extra: object = {}) {
    return { children, direction: null, format: "", indent: 0, type, version: 1, ...extra };
  }
}
