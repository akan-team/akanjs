import path from "node:path";
import { parseArgs } from "node:util";
import { AGENT_BLOCK_END, AGENT_BLOCK_START } from "@akanjs/devkit/guideline/agentsIndex";

export type DocSizes = Record<string, number>;

const generatedDocs = [".claude/rules/akan/*.md", ".agents/skills/*/SKILL.md", ".agents/skills/*/references/*.md"];
const readmes = ["pkgs/akanjs/README.md", "pkgs/akanjs/README.ko.md"];

export class AgentDocBudget {
  static readonly command = "bun run agent:budget";
  static readonly block = "AGENTS.md#akan:agent";
  static readonly slackPercent = 2;
  static readonly target = path.join(import.meta.dir, "agentDocBudget.json");
  static readonly repoRoot = path.resolve(import.meta.dir, "../../../..");

  static async read(file = AgentDocBudget.target): Promise<DocSizes> {
    const source = Bun.file(file);
    return (await source.exists()) ? ((await source.json()) as DocSizes) : {};
  }

  static async measure(root = AgentDocBudget.repoRoot): Promise<DocSizes> {
    const sizes: DocSizes = { [AgentDocBudget.block]: await AgentDocBudget.#blockSize(root) };
    for (const pattern of generatedDocs)
      for (const file of new Bun.Glob(pattern).scanSync({ cwd: root, dot: true, onlyFiles: true }))
        sizes[file.split(path.sep).join("/")] = Bun.file(path.join(root, file)).size;
    for (const file of readmes) sizes[file] = Bun.file(path.join(root, file)).size;
    return AgentDocBudget.#sorted(sizes);
  }

  static ceiling(budget: number) {
    return Math.floor((budget * (100 + AgentDocBudget.slackPercent)) / 100);
  }

  static floor(budget: number) {
    return Math.ceil((budget * (100 - AgentDocBudget.slackPercent)) / 100);
  }

  static problems(record: DocSizes, sizes: DocSizes): string[] {
    const { command } = AgentDocBudget;
    const problems: string[] = [];
    for (const [doc, size] of Object.entries(sizes)) {
      const budget = record[doc];
      if (budget === undefined) problems.push(`${doc} (${size} bytes) has no budget: run \`${command}\` to record it`);
      else if (size > AgentDocBudget.ceiling(budget))
        problems.push(
          `${doc} grew to ${size} bytes, past its budget of ${budget}: trim it, or raise the budget on purpose with \`${command} --raise ${doc}\``,
        );
      else if (size < AgentDocBudget.floor(budget))
        problems.push(`${doc} shrank to ${size} bytes from its budget of ${budget}: run \`${command}\` to lower it`);
    }
    for (const doc of Object.keys(record))
      if (!(doc in sizes)) problems.push(`${doc} has a budget but no file: run \`${command}\` to drop it`);
    return problems;
  }

  static next(record: DocSizes, sizes: DocSizes, raise: string[] = []): { next: DocSizes; grown: string[] } {
    const next: DocSizes = {};
    const grown: string[] = [];
    for (const [doc, size] of Object.entries(sizes)) {
      const budget = record[doc];
      if (budget === undefined || raise.includes(doc) || size <= budget) next[doc] = size;
      else {
        next[doc] = budget;
        if (size > AgentDocBudget.ceiling(budget)) grown.push(doc);
      }
    }
    return { next: AgentDocBudget.#sorted(next), grown };
  }

  static async #blockSize(root: string) {
    const agents = await Bun.file(path.join(root, "AGENTS.md")).text();
    const start = agents.indexOf(AGENT_BLOCK_START);
    const end = agents.indexOf(AGENT_BLOCK_END);
    if (start === -1 || end === -1) throw new Error(`${root}/AGENTS.md has no akan:agent block`);
    const block = agents.slice(start, end + AGENT_BLOCK_END.length);
    return Buffer.byteLength(block.replace(/<!-- akan:agent:version \S+ -->\n/, ""));
  }

  static #sorted(sizes: DocSizes): DocSizes {
    return Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { raise: { type: "string", multiple: true } } });
  const record = await AgentDocBudget.read();
  const sizes = await AgentDocBudget.measure();
  const raise = values.raise ?? [];
  const unknown = raise.filter((doc) => !(doc in sizes));
  if (unknown.length) {
    console.error(`[agent:budget] no such doc: ${unknown.join(", ")}`);
    process.exit(1);
  }
  const { next, grown } = AgentDocBudget.next(record, sizes, raise);
  await Bun.write(AgentDocBudget.target, `${JSON.stringify(next, null, 2)}\n`);
  console.info(`[agent:budget] ${Object.keys(next).length} docs recorded in ${AgentDocBudget.target}`);
  for (const doc of grown)
    console.error(
      `[agent:budget] ${doc} is ${sizes[doc]} bytes, past its budget of ${record[doc]}: trim it, or rerun with --raise ${doc}`,
    );
  if (grown.length) process.exitCode = 1;
}
