import ts from "typescript";

export interface SourceComment {
  raw: string;
  line: number;
  isJsDoc: boolean;
  body: string[];
}

export class SourceComments {
  static #scanner = ts.createScanner(ts.ScriptTarget.Latest, false);

  static of(sourceFile: ts.SourceFile): SourceComment[] {
    const comments: SourceComment[] = [];
    const scanGap = (start: number, end: number) => {
      if (end <= start) return;
      const scanner = SourceComments.#scanner;
      scanner.setText(sourceFile.text, start, end - start);
      for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
        if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
        comments.push(SourceComments.#commentOf(sourceFile, scanner.getTokenStart(), scanner.getTokenText()));
      }
      scanner.setText(undefined);
    };
    //? Only the trivia between AST children is scanned: string, template, regex and JSX text tokens can hold `//`.
    const visit = (node: ts.Node) => {
      if (node.kind === ts.SyntaxKind.JsxText) return;
      if (ts.isToken(node)) {
        scanGap(node.pos, node.getStart(sourceFile));
        return;
      }
      const children: ts.Node[] = [];
      ts.forEachChild(
        node,
        (child) => {
          children.push(child);
        },
        (nodes) => {
          children.push(...nodes);
        },
      );
      let cursor = node.pos;
      for (const child of children) {
        scanGap(cursor, child.pos);
        visit(child);
        cursor = Math.max(cursor, child.end);
      }
      scanGap(cursor, node.end);
    };
    visit(sourceFile);
    return comments;
  }

  static #commentOf(sourceFile: ts.SourceFile, pos: number, raw: string): SourceComment {
    return {
      raw,
      line: sourceFile.getLineAndCharacterOfPosition(pos).line + 1,
      isJsDoc: raw.startsWith("/**") && !raw.startsWith("/**/"),
      body: SourceComments.#bodyOf(raw),
    };
  }

  static #bodyOf(raw: string) {
    if (raw.startsWith("//")) return [raw.replace(/^\/\/+/, "").trim()];
    return raw
      .slice(2, raw.endsWith("*/") ? -2 : undefined)
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\*+/, "").trim());
  }
}
