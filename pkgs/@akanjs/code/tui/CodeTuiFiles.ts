/** Files for `@` mentions, listed once through git so `.gitignore` applies without a denylist of our own. */
export class CodeTuiFiles {
  static readonly limit = 8;

  readonly #root: string;
  #all: string[] = [];
  #loaded = false;

  constructor(root: string) {
    this.#root = root;
  }

  get ready() {
    return this.#loaded;
  }

  async load() {
    this.#all = await CodeTuiFiles.#list(this.#root);
    this.#loaded = true;
  }

  /** Case-insensitive substring matches, shortest path first. */
  match(query: string, limit = CodeTuiFiles.limit) {
    const needle = query.toLowerCase();
    if (!needle) return this.#all.slice(0, limit);
    const hits = this.#all.filter((file) => file.toLowerCase().includes(needle));
    return hits.sort((left, right) => left.length - right.length).slice(0, limit);
  }

  static async #list(root: string) {
    try {
      const proc = Bun.spawn(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
        cwd: root,
        stdout: "pipe",
        stderr: "ignore",
      });
      const text = await new Response(proc.stdout).text();
      if ((await proc.exited) !== 0) return [];
      return text.split("\n").filter((line) => !!line.trim());
    } catch {
      // no git or no repo: complete nothing rather than walk the disk
      return [];
    }
  }
}
