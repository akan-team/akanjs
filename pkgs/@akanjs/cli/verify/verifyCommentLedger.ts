import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type AddedComment, VerifyComments } from "./verifyComments";
import type { VerifyDiagnostic } from "./verifyDiagnostics";

type Seen = Record<string, string[]>;

export class VerifyCommentLedger {
  static readonly code = "akan.comment.kept";
  static readonly file = ".akan/verify/comments.json";

  //* A comment is known by its file and whole text, never its line: an edit above it must not report it again.
  static async settle(
    root: string,
    checked: string[],
    found: AddedComment[],
    { repeat }: { repeat: boolean },
  ): Promise<VerifyDiagnostic[]> {
    const head = await VerifyCommentLedger.#head(root);
    const seen = await VerifyCommentLedger.#read(root, head);
    const next: Seen = { ...seen };
    for (const file of checked) delete next[file];
    const fresh: VerifyDiagnostic[] = [];
    const kept: VerifyDiagnostic[] = [];
    for (const { text, diagnostic } of found) {
      const file = diagnostic.file ?? "";
      const hash = Bun.hash(text).toString(36);
      (repeat || !seen[file]?.includes(hash) ? fresh : kept).push(diagnostic);
      next[file] = [...new Set([...(next[file] ?? []), hash])];
    }
    if (JSON.stringify(next) !== JSON.stringify(seen))
      await VerifyCommentLedger.#write(root, { head, seen: next }).catch(() => undefined);
    const [first] = fresh;
    if (first) first.fix = VerifyComments.fix;
    return kept.length ? [...fresh, VerifyCommentLedger.#summary(kept)] : fresh;
  }

  static #summary(kept: VerifyDiagnostic[]): VerifyDiagnostic {
    const files = new Set(kept.map((diagnostic) => diagnostic.file)).size;
    const comments = `${kept.length} comment${kept.length === 1 ? "" : "s"}`;
    return {
      step: "lint",
      file: null,
      line: 0,
      col: 0,
      code: VerifyCommentLedger.code,
      severity: "warning",
      message: `${comments} added since the last commit, reported by an earlier run, ${kept.length === 1 ? "is" : "are"} still in ${files} file${files === 1 ? "" : "s"}; akan verify --comments lists them`,
    };
  }

  static async #read(root: string, head: string): Promise<Seen> {
    const file = Bun.file(path.join(root, VerifyCommentLedger.file));
    if (!(await file.exists())) return {};
    const ledger = (await file.json().catch(() => null)) as { head?: unknown; seen?: unknown } | null;
    if (ledger?.head !== head || !ledger.seen || typeof ledger.seen !== "object") return {};
    return Object.fromEntries(
      Object.entries(ledger.seen).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((hash) => typeof hash === "string"),
      ),
    );
  }

  static async #write(root: string, ledger: { head: string; seen: Seen }) {
    const file = path.join(root, VerifyCommentLedger.file);
    await mkdir(path.dirname(file), { recursive: true });
    await Bun.write(file, `${JSON.stringify(ledger)}\n`);
  }

  static async #head(root: string) {
    const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "ignore" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? stdout.trim() : "";
  }
}
