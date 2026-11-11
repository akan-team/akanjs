import { compareExportNames } from "akanjs/common";

export interface JsxElement {
  tag: string;
  attrs: JsxAttr[];
}
export type JsxAttr = string | { name: string; param: string; body: JsxElement };

//? A scaffold is written before `bun install`, when no Biome can format it, so these break lines where Biome would.
export class BiomeForm {
  static readonly lineWidth = 120;

  //? Biome counts a Hangul syllable as two columns, as Bun.stringWidth does.
  static fits(line: string) {
    return Bun.stringWidth(line) <= BiomeForm.lineWidth;
  }

  static sorted(specifiers: string[]) {
    return specifiers.toSorted((a, b) => compareExportNames(a.replace(/^type /, ""), b.replace(/^type /, "")));
  }

  //? Biome never breaks an import of one specifier, however long.
  static importFrom(specifiers: string[], source: string, { typeOnly = false }: { typeOnly?: boolean } = {}) {
    const keyword = typeOnly ? "import type" : "import";
    const names = BiomeForm.sorted(specifiers);
    const flat = `${keyword} { ${names.join(", ")} } from "${source}";`;
    if (names.length === 1 || BiomeForm.fits(flat)) return flat;
    return `${keyword} {\n${names.map((name) => `  ${name},`).join("\n")}\n} from "${source}";`;
  }

  //? A multi-line argument comes indented as it reads hugged, relative to the indent the call starts at.
  static callArgs(indent: string, head: string, args: string[], tail = "") {
    const leading = args.slice(0, -1);
    const lastLines = (args.at(-1) ?? "").split("\n");
    if (lastLines.length === 1) {
      const flat = `${indent}${head}(${args.join(", ")})${tail}`;
      if (BiomeForm.fits(flat)) return flat;
    } else {
      const opening = `${indent}${head}(${[...leading, lastLines[0]].join(", ")}`;
      const closing = `${lastLines.at(-1)})${tail}`;
      if (BiomeForm.fits(opening) && BiomeForm.fits(`${indent}${closing}`))
        return [
          opening,
          ...lastLines.slice(1, -1).map((line) => BiomeForm.#indented(line, indent)),
          `${indent}${closing}`,
        ].join("\n");
    }
    const broken = args.map((arg) =>
      `${arg},`
        .split("\n")
        .map((line) => BiomeForm.#indented(line, `${indent}  `))
        .join("\n"),
    );
    return `${indent}${head}(\n${broken.join("\n")}\n${indent})${tail}`;
  }

  //? Biome breaks after `=` only when the right side cannot break before the line ends.
  static assign(indent: string, target: string, head: string, args: string[], tail = "") {
    const call = BiomeForm.callArgs(indent, `${target} = ${head}`, args, tail);
    if (!call.includes("\n") || (args.length > 0 && BiomeForm.fits(`${indent}${target} = ${head}(`))) return call;
    return `${indent}${target} =\n${BiomeForm.callArgs(`${indent}  `, head, args, tail)}`;
  }

  //? A broken type argument list takes no trailing comma.
  static typeArgs(indent: string, head: string, args: string[], tail = "") {
    const flat = `${indent}${head}<${args.join(", ")}>${tail}`;
    if (BiomeForm.fits(flat)) return flat;
    return `${indent}${head}<\n${args.map((arg) => `${indent}  ${arg}`).join(",\n")}\n${indent}>${tail}`;
  }

  //? JSX text that does not fit ends its line with an explicit `{" "}`, since a line break there would drop the space.
  static jsxSpaced(indent: string, first: string, second: string) {
    const flat = `${indent}${first} ${second}`;
    if (BiomeForm.fits(flat)) return flat;
    return `${indent}${first}{" "}\n${indent}${second}`;
  }

  static wrap(indent: string, open: string, child: string, close: string) {
    const flat = `${indent}${open}${child}${close}`;
    if (BiomeForm.fits(flat)) return flat;
    return `${indent}${open}\n${indent}  ${child}\n${indent}${close}`;
  }

  static element(element: JsxElement, indent: string, { before = "", after = "" } = {}): string {
    const flat = `${indent}${before}${BiomeForm.#flat(element)}${after}`;
    if (BiomeForm.fits(flat)) return flat;
    const attrs = element.attrs.map((attr) => BiomeForm.#attr(attr, `${indent}  `));
    return `${indent}${before}<${element.tag}\n${attrs.join("\n")}\n${indent}/>${after}`;
  }

  static openingTag(element: JsxElement, indent: string) {
    const flat = `${indent}<${element.tag} ${element.attrs.map((attr) => BiomeForm.#flatAttr(attr)).join(" ")}>`;
    if (BiomeForm.fits(flat)) return flat;
    const attrs = element.attrs.map((attr) => BiomeForm.#attr(attr, `${indent}  `));
    return `${indent}<${element.tag}\n${attrs.join("\n")}\n${indent}>`;
  }

  static returnElement(element: JsxElement, indent: string) {
    const flat = `${indent}return ${BiomeForm.#flat(element)};`;
    if (BiomeForm.fits(flat)) return flat;
    return `${indent}return (\n${BiomeForm.element(element, `${indent}  `)}\n${indent});`;
  }

  static dictionaryOf(label: readonly [string, string], desc: readonly [string, string]) {
    const body = `t(${BiomeForm.#pair(label)}).desc(${BiomeForm.#pair(desc)})`;
    if (BiomeForm.fits(`  .of((t) => ${body})`)) return `  .of((t) => ${body})`;
    if (BiomeForm.fits(`    ${body},`)) return `  .of((t) =>\n    ${body},\n  )`;
    const descLines = desc.map((text) => `      ${JSON.stringify(text)},`).join("\n");
    if (BiomeForm.fits(`    t(${BiomeForm.#pair(label)}).desc([`))
      return `  .of((t) =>\n    t(${BiomeForm.#pair(label)}).desc([\n${descLines}\n    ]),\n  )`;
    const labelLines = label.map((text) => `      ${JSON.stringify(text)},`).join("\n");
    return `  .of((t) =>\n    t([\n${labelLines}\n    ]).desc([\n${descLines}\n    ]),\n  )`;
  }

  static dictionarySlice(key: string, label: readonly [string, string]) {
    const head = `    ${key}: fn(${BiomeForm.#pair(label)}).arg(`;
    if (BiomeForm.fits(`${head}(t) => ({})),`)) return `${head}(t) => ({})),`;
    if (BiomeForm.fits(head)) return `${head}\n      (t) => ({}),\n    ),`;
    const labelLines = label.map((text) => `      ${JSON.stringify(text)},`).join("\n");
    return `    ${key}: fn([\n${labelLines}\n    ]).arg((t) => ({})),`;
  }

  static #pair(pair: readonly [string, string]) {
    return `[${pair.map((text) => JSON.stringify(text)).join(", ")}]`;
  }

  static #indented(line: string, indent: string) {
    return line ? `${indent}${line}` : line;
  }

  static #flat({ tag, attrs }: JsxElement): string {
    return `<${[tag, ...attrs.map((attr) => BiomeForm.#flatAttr(attr))].join(" ")} />`;
  }

  static #flatAttr(attr: JsxAttr): string {
    return typeof attr === "string" ? attr : `${attr.name}={(${attr.param}) => ${BiomeForm.#flat(attr.body)}}`;
  }

  static #attr(attr: JsxAttr, indent: string): string {
    const flat = `${indent}${BiomeForm.#flatAttr(attr)}`;
    if (typeof attr === "string" || BiomeForm.fits(flat)) return flat;
    return `${indent}${attr.name}={(${attr.param}) => (\n${BiomeForm.element(attr.body, `${indent}  `)}\n${indent})}`;
  }
}
