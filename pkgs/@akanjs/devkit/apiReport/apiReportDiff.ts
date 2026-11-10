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
  static readonly #referencedSuffix = " (referenced)";

  static blocksOf(text: string) {
    const [exported = "", referenced = ""] = text.split(`\n${ApiReport.referencedHeading}\n`);
    const blocks = new Map<string, string>();
    for (const [name, block] of ApiReportDiff.#namedBlocksOf(exported)) blocks.set(name, block);
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

  //? A referenced declaration that disappears is not a break of its own: whatever named it changed too, or exports it.
  static breaks(before: ApiReportFiles, after: ApiReportFiles): ApiBreak[] {
    return [...before].flatMap(([report, text]) => {
      const previous = ApiReportDiff.blocksOf(text);
      const next = ApiReportDiff.blocksOf(after.get(report) ?? "");
      return [...previous].flatMap(([name, block]): ApiBreak[] => {
        const current = next.get(name);
        if (current === undefined)
          return ApiReportDiff.#isReferenced(name) ? [] : [{ report, name, kind: "removed", before: block }];
        if (ApiReportDiff.#withoutTags(current) === ApiReportDiff.#withoutTags(block)) return [];
        return [{ report, name, kind: "changed", before: block, after: current }];
      });
    });
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

  static #nameOf(head: string) {
    if (head.startsWith("export default ")) return "default";
    const reexport = ApiReportDiff.#reexportPattern.exec(head);
    if (reexport) return reexport[2] ?? reexport[1] ?? null;
    const namespaceReexport = ApiReportDiff.#namespaceReexportPattern.exec(head);
    if (namespaceReexport) return namespaceReexport[1] ?? null;
    return ApiReportDiff.#declarationPattern.exec(head)?.[1] ?? null;
  }

  static #isReferenced(name: string) {
    return name.endsWith(ApiReportDiff.#referencedSuffix) || name.includes(" (referenced, ");
  }

  static #withoutTags(block: string) {
    return block
      .split("\n")
      .filter((line) => !ApiReportDiff.#tagLine.test(line))
      .join("\n");
  }
}
