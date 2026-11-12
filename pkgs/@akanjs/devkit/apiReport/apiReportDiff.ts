import ts from "typescript";
import { ApiReport } from "./apiReport";

export interface ApiBreak {
  report: string;
  name: string;
  kind: "removed" | "changed";
  before?: string;
  after?: string;
}

export interface ApiDrift {
  changed: string[];
  added: string[];
  removed: string[];
}

export type ApiReportFiles = ReadonlyMap<string, string>;

export class ApiReportDiff {
  static readonly #declarationPattern =
    /^(?:export )?(?:declare )?(?:abstract |const )?(?:class|function|interface|type|enum|namespace|module|const|let|var) ([^\s<(:=;{]+)/;
  static readonly #reexportPattern = /^export \{ (\S+)(?: as (\S+))? \} from /;
  static readonly #namespaceReexportPattern = /^export \* as (\S+) from /;
  static readonly #tagLine = /^\/\*\* (?:@\w+ ?)+\*\/$/;
  static readonly #printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  static readonly #subpathPattern = /^- `(\S+)`$/gm;
  static readonly #referencedSuffix = " (referenced)";
  static readonly #referencedMark = " (referenced";

  static blocksOf(text: string) {
    const [exported = "", referenced = ""] = text.split(`\n${ApiReport.referencedHeading}\n`);
    const blocks = new Map<string, string>();
    for (const [name, block] of ApiReportDiff.#namedBlocksOf(exported)) blocks.set(name, block);
    for (const [block, subpath = ""] of ApiReportDiff.#subpathsOf(exported)) blocks.set(subpath, block);
    for (const [name, block, module] of ApiReportDiff.#namedBlocksOf(referenced))
      blocks.set(module ? `${name} (referenced, ${module})` : `${name}${ApiReportDiff.#referencedSuffix}`, block);
    return blocks;
  }

  static drift(committed: ApiReportFiles, generated: ApiReportFiles): ApiDrift {
    return {
      changed: [...generated]
        .filter(([file, text]) => committed.has(file) && committed.get(file) !== text)
        .map(([file]) => file),
      added: [...generated.keys()].filter((file) => !committed.has(file)),
      removed: [...committed.keys()].filter((file) => !generated.has(file)),
    };
  }

  static hasDrift({ changed, added, removed }: ApiDrift) {
    return changed.length + added.length + removed.length > 0;
  }

  static breaks(before: ApiReportFiles, after: ApiReportFiles): ApiBreak[] {
    const nextReports = new Map([...after].map(([report, text]) => [report, ApiReportDiff.blocksOf(text)]));
    return [...before].flatMap(([report, text]) => {
      const next = nextReports.get(report) ?? new Map<string, string>();
      return [...ApiReportDiff.blocksOf(text)].flatMap(([name, block]): ApiBreak[] => {
        const current = next.get(name);
        if (current !== undefined)
          return ApiReportDiff.#sameDeclaration(current, block)
            ? []
            : [{ report, name, kind: "changed", before: block, after: current }];
        const referenced = ApiReportDiff.#referencedNameOf(name);
        if (referenced === null) return [{ report, name, kind: "removed", before: block }];
        const successors = ApiReportDiff.#successorsOf(referenced, report, nextReports);
        //? Found nowhere, it is named by nothing now: whatever named it changed, and that change is the break.
        if (!successors.length || successors.some((successor) => ApiReportDiff.#sameDeclaration(successor, block)))
          return [];
        return [{ report, name, kind: "changed", before: block, after: successors.join("\n\n") }];
      });
    });
  }

  static #successorsOf(name: string, report: string, nextReports: ReadonlyMap<string, ReadonlyMap<string, string>>) {
    const others = [...nextReports].filter(([other]) => other !== report).map(([, blocks]) => blocks);
    const found = [nextReports.get(report) ?? new Map<string, string>(), ...others].flatMap((blocks) =>
      [...blocks]
        .filter(([key]) => key === name || ApiReportDiff.#referencedNameOf(key) === name)
        .map(([, block]) => block),
    );
    return found.filter(
      (block, idx) => found.findIndex((other) => ApiReportDiff.#sameDeclaration(other, block)) === idx,
    );
  }

  static #namedBlocksOf(section: string): [string, string, string | null][] {
    const body = /```ts\n([\s\S]*?)\n?```/.exec(section)?.[1] ?? "";
    return body.split("\n\n").flatMap((block): [string, string, string | null][] => {
      const lines = block.split("\n");
      const module = lines[0]?.startsWith("// ") ? lines[0].slice(3) : null;
      const head = lines.find((line) => !line.startsWith("/**") && !line.startsWith("// ")) ?? "";
      const name = ApiReportDiff.#nameOf(head);
      return name === null ? [] : [[name, block, module]];
    });
  }

  static #subpathsOf(section: string) {
    return section.replace(/```ts\n[\s\S]*?```/g, "").matchAll(ApiReportDiff.#subpathPattern);
  }

  static #nameOf(head: string) {
    if (head.startsWith("export default ")) return "default";
    const reexport = ApiReportDiff.#reexportPattern.exec(head);
    if (reexport) return reexport[2] ?? reexport[1] ?? null;
    const namespaceReexport = ApiReportDiff.#namespaceReexportPattern.exec(head);
    if (namespaceReexport) return namespaceReexport[1] ?? null;
    return ApiReportDiff.#declarationPattern.exec(head)?.[1] ?? null;
  }

  static #referencedNameOf(key: string) {
    const index = key.indexOf(ApiReportDiff.#referencedMark);
    return index < 0 ? null : key.slice(0, index);
  }

  static #sameDeclaration(a: string, b: string) {
    const [left, right] = [ApiReportDiff.#declarationOf(a), ApiReportDiff.#declarationOf(b)];
    return left === right || ApiReportDiff.#unorderedOf(left) === ApiReportDiff.#unorderedOf(right);
  }

  //? The checker orders union members and mapped keys by first sight, so checking files in another order moves them.
  static #unorderedOf(declaration: string) {
    const source = ts.createSourceFile("block.d.ts", declaration, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    //? `parseDiagnostics` is internal: parser recovery can drop tokens, so a block that failed to parse stays as text.
    if ("parseDiagnostics" in source && Array.isArray(source.parseDiagnostics) && source.parseDiagnostics.length)
      return declaration;
    const textOf = (node: ts.Node) => ApiReportDiff.#printer.printNode(ts.EmitHint.Unspecified, node, source);
    const byText = (a: ts.Node, b: ts.Node) => ApiReport.compare(textOf(a), textOf(b));
    const byName = (a: ts.TypeElement, b: ts.TypeElement) =>
      ApiReport.compare(a.name ? textOf(a.name) : "", b.name ? textOf(b.name) : "");
    const sortMembers: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const visit = (node: ts.Node): ts.Node => {
        const next = ts.visitEachChild(node, visit, context);
        if (ts.isUnionTypeNode(next))
          return context.factory.updateUnionTypeNode(
            next,
            context.factory.createNodeArray([...next.types].sort(byText)),
          );
        if (ts.isTypeLiteralNode(next))
          return context.factory.updateTypeLiteralNode(
            next,
            context.factory.createNodeArray([...next.members].sort(byName)),
          );
        return next;
      };
      return (file) => ts.visitEachChild(file, visit, context);
    };
    const [sorted = source] = ts.transform(source, [sortMembers]).transformed;
    return ApiReportDiff.#printer.printFile(sorted);
  }

  static #declarationOf(block: string) {
    return block
      .split("\n")
      .filter((line, idx) => !ApiReportDiff.#tagLine.test(line) && !(idx === 0 && line.startsWith("// ")))
      .map((line) => (line.startsWith("export ") ? line.slice("export ".length) : line))
      .join("\n");
  }
}
