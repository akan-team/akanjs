// A small XML element tree for Android manifests (akanjs readiness O8: merging the manifests of
// pinned AARs). Elements, attributes and text; comments, processing instructions and the doctype are
// dropped. Enough for AndroidManifest.xml, not a general XML library.

export interface XmlElement {
  name: string;
  /** In source order; names keep their prefix ("android:name"). */
  attrs: [name: string, value: string][];
  children: XmlElement[];
}

const unescape = (text: string) =>
  text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e === "lt"
      ? "<"
      : e === "gt"
        ? ">"
        : e === "amp"
          ? "&"
          : e === "quot"
            ? '"'
            : e === "apos"
              ? "'"
              : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))),
  );

export const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Parses a document's root element. Text between elements is ignored (manifests have none that matters). */
export function parseXml(source: string): XmlElement {
  const text = source.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g, "");
  const tag = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  for (let m = tag.exec(text); m; m = tag.exec(text)) {
    const [, closing, name, attrText, selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (!open || open.name !== name) throw new Error(`XML: </${name}> does not close <${open?.name ?? "nothing"}>`);
      continue;
    }
    const attrs: [string, string][] = [...attrText!.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((a) => [
      a[1]!,
      unescape(a[2] ?? a[3] ?? ""),
    ]);
    const element: XmlElement = { name: name!, attrs, children: [] };
    if (stack.length) stack[stack.length - 1]!.children.push(element);
    else if (!root) root = element;
    else throw new Error("XML: more than one root element");
    if (!selfClosing) stack.push(element);
  }
  if (stack.length) throw new Error(`XML: <${stack[stack.length - 1]!.name}> is not closed`);
  if (!root) throw new Error("XML: no element");
  return root;
}

export function attr(element: XmlElement, name: string): string | undefined {
  return element.attrs.find(([n]) => n === name)?.[1];
}

export function setAttr(element: XmlElement, name: string, value: string): void {
  const found = element.attrs.find(([n]) => n === name);
  if (found) found[1] = value;
  else element.attrs.push([name, value]);
}

/** The element as XML text, indented by `indent`. */
export function serializeXml(element: XmlElement, indent = "", step = "    "): string {
  const attrs = element.attrs.map(([n, v]) => ` ${n}="${escapeXml(v)}"`).join("");
  if (!element.children.length) return `${indent}<${element.name}${attrs} />`;
  const inner = element.children.map((c) => serializeXml(c, indent + step, step)).join("\n");
  return `${indent}<${element.name}${attrs}>\n${inner}\n${indent}</${element.name}>`;
}
