import path from "node:path";
import ts from "typescript";
import { AbstractDoc } from "./abstractDoc";

export type FileKind =
  | keyof typeof MaintainabilityLimits.fileMaxLines
  | keyof typeof MaintainabilityLimits.folderMaxLines;

export class MaintainabilityLimits {
  static readonly fileMaxLines = {
    ".Template.tsx": 400,
    ".Unit.tsx": 400,
    ".Util.tsx": 400,
    ".View.tsx": 400,
    ".Zone.tsx": 400,
    ".store.ts": 400,
    ".document.ts": 500,
    ".service.ts": 500,
    [AbstractDoc.suffix]: AbstractDoc.maxLines,
  } as const;
  static readonly folderMaxLines = { "ui/": 400, "webkit/": 400 } as const;
  static readonly #maxLinesByKind = { ...MaintainabilityLimits.fileMaxLines, ...MaintainabilityLimits.folderMaxLines };
  static readonly componentMaxLines = 250;
  static readonly componentMaxStoreAccesses = 16;
  static readonly packageFileMaxLines = 800;
  static readonly functionMaxLines = 150;
  static readonly classMaxMembers = 60;

  static fileKindOf(sysRelativePath: string): FileKind | null {
    const kinds = Object.keys(MaintainabilityLimits.#maxLinesByKind) as FileKind[];
    const suffix = kinds.find((kind) => sysRelativePath.endsWith(kind));
    if (suffix) return suffix;
    if (!/\.tsx?$/.test(sysRelativePath) || MaintainabilityLimits.#isTest(sysRelativePath)) return null;
    return kinds.find((kind) => sysRelativePath.startsWith(kind)) ?? null;
  }

  static fileMaxLinesOf(sysRelativePath: string) {
    const kind = MaintainabilityLimits.fileKindOf(sysRelativePath);
    return kind ? MaintainabilityLimits.#maxLinesByKind[kind] : null;
  }

  static isReexportBarrel(file: string, content: string) {
    if (path.posix.basename(file) !== "index.ts") return false;
    return ts
      .createSourceFile(file, content, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
      .statements.every((statement) => ts.isExportDeclaration(statement));
  }

  static lineCountOf(content: string) {
    return AbstractDoc.lineCountOf(content);
  }

  //? Under `lib/` only the `.tsx` components run in the browser; `ui/` and `webkit/` run there whole.
  static isClientCode(sysRelativePath: string) {
    if (MaintainabilityLimits.#isTest(sysRelativePath)) return false;
    if (sysRelativePath.startsWith("lib/")) return sysRelativePath.endsWith(".tsx");
    return /^(ui|webkit)\/.+\.tsx?$/.test(sysRelativePath) && !sysRelativePath.endsWith(".d.ts");
  }

  static isPackageSource(pkgRelativePath: string) {
    return (
      /\.tsx?$/.test(pkgRelativePath) &&
      !pkgRelativePath.endsWith(".d.ts") &&
      !/(^|\/)examples\//.test(pkgRelativePath) &&
      !MaintainabilityLimits.#isTest(pkgRelativePath)
    );
  }

  static #isTest(sysRelativePath: string) {
    return /\.(test|spec)\.tsx?$/.test(sysRelativePath);
  }
}
