import fsPromise from "node:fs/promises";
import path from "node:path";

export interface ConventionRule {
  name: string;
  description: string;
  paths: string[];
  body: string;
}

export class ConventionSet {
  constructor(
    readonly core: string,
    readonly rules: ConventionRule[],
  ) {}

  static async load(dir: string) {
    const core = await fsPromise.readFile(path.join(dir, "core.md"), "utf-8");
    const files = (await fsPromise.readdir(path.join(dir, "rules"))).filter((file) => file.endsWith(".md")).sort();
    const rules = await Promise.all(
      files.map(async (file) =>
        ConventionSet.parseRule(file.slice(0, -3), await fsPromise.readFile(path.join(dir, "rules", file), "utf-8")),
      ),
    );
    return new ConventionSet(core.trim(), rules);
  }

  static parseRule(name: string, text: string): ConventionRule {
    const match: RegExpExecArray | null = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!match) throw new Error(`Convention rule ${name} has no frontmatter`);
    const front = match[1] ?? "";
    const described: RegExpExecArray | null = /^description:(.*)$/m.exec(front);
    const description = described?.[1]?.trim() ?? "";
    const paths = [...front.matchAll(/^\s+-\s+"([^"]+)"$/gm)].map((entry) => entry[1] ?? "");
    if (!description || paths.length === 0) throw new Error(`Convention rule ${name} needs a description and paths`);
    return { name, description, paths, body: text.slice(match[0].length).trim() };
  }

  //? Cursor splits `globs:` on commas, so a `{a,b}` brace list has to be expanded before it is written there.
  static expand(glob: string): string[] {
    const open = glob.indexOf("{");
    if (open === -1) return [glob];
    const close = glob.indexOf("}", open);
    if (close === -1) return [glob];
    const head = glob.slice(0, open);
    const tail = glob.slice(close + 1);
    return glob
      .slice(open + 1, close)
      .split(",")
      .flatMap((choice) => ConventionSet.expand(`${head}${choice}${tail}`));
  }

  static demote(markdown: string) {
    let fenced = false;
    return markdown
      .split("\n")
      .map((line) => {
        if (line.startsWith("```")) fenced = !fenced;
        return !fenced && /^#{1,5} /.test(line) ? `#${line}` : line;
      })
      .join("\n");
  }

  get instruction() {
    return `${[this.core, ...this.rules.map((rule) => ConventionSet.demote(rule.body))].join("\n\n")}\n`;
  }
}
