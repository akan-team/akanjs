import { existsSync } from "node:fs";
import path from "node:path";
import type ts from "typescript";
import type { VerifyDiagnostic } from "./verifyDiagnostics";

type TypeScript = typeof ts;

interface CommentRange {
  text: string;
  line: number;
  col: number;
  lastLine: number;
}

export class VerifyComments {
  static readonly code = "akan.comment.added";
  static readonly fix =
    "keep only a fact the code cannot say (vendor quirk, constraint, security, domain meaning, rejected alternative); delete the rest";
  static readonly #codeFile = /\.[cm]?[jt]sx?$/;
  static readonly #directive =
    /^(\/\/\/?|\/\*+)\s*(biome-ignore|@ts-|eslint-|prettier-ignore|#region|#endregion|<reference|[#@]__PURE__|@__NO_SIDE_EFFECTS__)/;
  static readonly #trackedTodo = /^(\/\/|\/\*+)\s*TODO:?\s*https?:\/\/\S[^\n]*$/;
  static #typescriptLoad: Promise<TypeScript> | undefined;
  static #templateCommentsLoad: Promise<Set<string>> | undefined;

  // Lazy: `typescript` is ~70 MB resident and the cli entry reaches this file (`entryModuleGraph.test.ts`).
  static #loadTypescript(): Promise<TypeScript> {
    VerifyComments.#typescriptLoad ??= import("typescript").then((mod) => (mod.default ?? mod) as TypeScript);
    return VerifyComments.#typescriptLoad;
  }

  static async added(root: string, files: string[]): Promise<VerifyDiagnostic[]> {
    const code = files.filter((file) => VerifyComments.#codeFile.test(file) && existsSync(path.join(root, file)));
    if (!code.length) return [];
    const changed = await VerifyComments.#addedLines(root, code);
    if (!changed) return [];
    const typescript = await VerifyComments.#loadTypescript();
    const templateComments = await VerifyComments.#loadTemplateComments();
    const diagnostics: VerifyDiagnostic[] = [];
    for (const file of code) {
      const lines = changed.get(file);
      if (lines?.size === 0) continue;
      const text = await Bun.file(path.join(root, file)).text();
      for (const comment of VerifyComments.commentsOf(typescript, file, text)) {
        if (VerifyComments.#directive.test(comment.text)) continue;
        if (VerifyComments.#trackedTodo.test(comment.text)) continue;
        if (VerifyComments.#scaffolded(comment, templateComments)) continue;
        if (lines && !VerifyComments.#touches(comment, lines)) continue;
        diagnostics.push({
          step: "lint",
          file,
          line: comment.line,
          col: comment.col,
          code: VerifyComments.code,
          severity: "warning",
          message: VerifyComments.#excerpt(comment.text),
        });
      }
    }
    const [first] = diagnostics;
    if (first) first.fix = VerifyComments.fix;
    return diagnostics;
  }

  //* Read from each token's leading trivia, never by a bare scan: `// x` inside JSX text is text, not a comment.
  static commentsOf(typescript: TypeScript, file: string, text: string): CommentRange[] {
    const kind = file.endsWith("x") ? typescript.ScriptKind.TSX : typescript.ScriptKind.TS;
    const source = typescript.createSourceFile(file, text, typescript.ScriptTarget.Latest, true, kind);
    const ranges = new Map<number, ts.CommentRange>();
    const visit = (node: ts.Node) => {
      if (node.kind === typescript.SyntaxKind.JsxText) return;
      if (node.kind >= typescript.SyntaxKind.FirstJSDocNode && node.kind <= typescript.SyntaxKind.LastJSDocNode) return;
      const children = node.getChildren(source);
      for (const child of children) visit(child);
      if (children.length) return;
      const start = node.getFullStart();
      for (const range of [
        ...(typescript.getTrailingCommentRanges(text, start) ?? []),
        ...(typescript.getLeadingCommentRanges(text, start) ?? []),
      ])
        ranges.set(range.pos, range);
    };
    visit(source);
    return [...ranges.values()]
      .sort((a, b) => a.pos - b.pos)
      .map((range) => {
        const start = source.getLineAndCharacterOfPosition(range.pos);
        const end = source.getLineAndCharacterOfPosition(range.end);
        return {
          text: text.slice(range.pos, range.end),
          line: start.line + 1,
          col: start.character + 1,
          lastLine: end.line + 1,
        };
      });
  }

  //? A scaffold writes into new, untracked files, so the diff alone would count every comment its templates carry.
  static #scaffolded(comment: CommentRange, templateComments: Set<string>) {
    return comment.text.split("\n").every((line) => !line.trim() || templateComments.has(line.trim()));
  }

  //? A template emits its comments from inside template literals and quoted strings: hence the `\n` split and unescape.
  static #loadTemplateComments(): Promise<Set<string>> {
    VerifyComments.#templateCommentsLoad ??= (async () => {
      const comments = new Set<string>();
      const root = ["templates", "../templates"].map((dir) => path.join(import.meta.dir, dir)).find(existsSync);
      if (!root) return comments;
      for (const file of new Bun.Glob("**/*.{ts,tsx,template}").scanSync({ cwd: root, dot: true }))
        for (const raw of (await Bun.file(path.join(root, file)).text()).split(/\n|\\n/)) {
          const line = raw.replace(/\\([`$\\])/g, "$1").trim();
          for (const { index } of line.matchAll(/\/\/|\/\*|^\*/g)) comments.add(line.slice(index).trim());
        }
      return comments;
    })();
    return VerifyComments.#templateCommentsLoad;
  }

  static #touches(comment: CommentRange, lines: Set<number>) {
    for (let line = comment.line; line <= comment.lastLine; line++) if (lines.has(line)) return true;
    return false;
  }

  static #excerpt(comment: string) {
    const first = comment.split("\n").find((line) => line.replace(/^[\s/*]+/, "").trim()) ?? comment;
    const flat = first.replace(/\s+/g, " ").trim();
    return flat.length <= 60 ? flat : `${flat.slice(0, 59)}…`;
  }

  static async #addedLines(root: string, files: string[]): Promise<Map<string, Set<number> | undefined> | null> {
    const tracked = await VerifyComments.#git(root, ["ls-files", "-z", "--", ...files]);
    const diff = await VerifyComments.#git(root, [
      "-c",
      "core.quotePath=false",
      "diff",
      "-U0",
      "--no-color",
      "--no-ext-diff",
      "--relative",
      "HEAD",
      "--",
      ...files,
    ]);
    if (tracked === null || diff === null) return null;
    const trackedFiles = new Set(tracked.split("\0").filter(Boolean));
    const added = VerifyComments.parseDiff(diff);
    return new Map(
      files.map((file) => [file, trackedFiles.has(file) ? (added.get(file) ?? new Set<number>()) : undefined]),
    );
  }

  static parseDiff(diff: string) {
    const added = new Map<string, Set<number>>();
    let current: Set<number> | null = null;
    for (const line of diff.split("\n")) {
      if (line.startsWith("+++ ")) {
        const file = line.slice(4).replace(/^b\//, "");
        current = file === "/dev/null" ? null : new Set<number>();
        if (current) added.set(file, current);
        continue;
      }
      const [, from, length] = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/) ?? [];
      if (from === undefined || !current) continue;
      const start = Number(from);
      const count = length === undefined ? 1 : Number(length);
      for (let offset = 0; offset < count; offset++) current.add(start + offset);
    }
    return added;
  }

  static async #git(root: string, args: string[]) {
    const proc = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "ignore" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? stdout : null;
  }
}
