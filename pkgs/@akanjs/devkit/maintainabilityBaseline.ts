import { JsonFormatter } from "./jsonFormatter";
import type { DebtRuleId, MaintainabilityViolation } from "./maintainabilityContract";

export interface BaselineEntryGrowth {
  rule: DebtRuleId;
  key: string;
  count: number;
  committed?: number;
}

export interface BaselineEntry {
  key: string;
  count: number;
  reason?: string;
}

type Counts = ReadonlyMap<string, number>;

//* One section per rule, each key holding what the gate measured: lines, members, store accesses, writes or calls.
//* A count only falls, so a recorded entry cannot take on more of the debt it records.
export class MaintainabilityBaseline {
  static readonly fileName = "akan.baseline.json";
  static readonly reasonMinChars = 10;
  static readonly debtRules = [
    "akan.size.file",
    "akan.size.component",
    "akan.size.function",
    "akan.size.class",
    "akan.component.store-access",
    "akan.store.multi-write",
    "akan.store.root-write-chain",
    "akan.component.write-chain",
    "akan.write.placement",
    "akan.service.call-in-loop",
  ] as const satisfies readonly DebtRuleId[];
  static readonly reasonedRules: ReadonlySet<DebtRuleId> = new Set([
    "akan.size.file",
    "akan.size.component",
    "akan.size.function",
    "akan.size.class",
    "akan.component.store-access",
    "akan.service.call-in-loop",
  ]);

  static countOf(violation: MaintainabilityViolation) {
    if (violation.kind === "size") return violation.lineCount;
    if (violation.kind === "classSize") return violation.memberCount;
    if (violation.kind === "storeAccess") return violation.accessCount;
    if (violation.kind === "multiWrite") return violation.writeCount;
    if (violation.kind === "writePlacement") return violation.writes.length;
    return violation.calls.length;
  }

  static isDebtRule(name: string): name is DebtRuleId {
    return (MaintainabilityBaseline.debtRules as readonly string[]).includes(name);
  }

  //? `lenient` reads another commit's copy, whose sections an older or newer CLI may have named differently.
  static parse(
    text: string,
    source = MaintainabilityBaseline.fileName,
    { lenient = false }: { lenient?: boolean } = {},
  ) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${source} is not valid JSON.`);
    }
    if (typeof json !== "object" || json === null || Array.isArray(json))
      throw new Error(`${source} holds an object keyed by rule id.`);
    const sections = new Map<DebtRuleId, Counts>();
    let reasons = new Map<string, string>();
    for (const [name, value] of Object.entries(json)) {
      if (name === "reasons") {
        const entries = MaintainabilityBaseline.#reasonsOf(value);
        if (!entries) throw new Error(`${source}: "reasons" maps an entry's key to a sentence.`);
        reasons = new Map(entries);
        continue;
      }
      if (!MaintainabilityBaseline.isDebtRule(name)) {
        if (lenient) continue;
        throw new Error(
          `${source}: "${name}" is not a rule id. Its sections are ${MaintainabilityBaseline.debtRules.join(", ")} and "reasons"; rewrite it with \`akan quality baseline --force\`.`,
        );
      }
      const counts = MaintainabilityBaseline.#countsOf(value);
      if (!counts) throw new Error(`${source}: "${name}" maps each key to a whole-number count.`);
      sections.set(name, new Map(counts));
    }
    return new MaintainabilityBaseline(sections, reasons);
  }

  static of(violations: MaintainabilityViolation[], reasons: ReadonlyMap<string, string> = new Map()) {
    const sections = new Map<DebtRuleId, Map<string, number>>();
    for (const violation of violations) {
      const counts = sections.get(violation.rule) ?? new Map<string, number>();
      const count = MaintainabilityBaseline.countOf(violation);
      counts.set(violation.key, Math.max(counts.get(violation.key) ?? 0, count));
      sections.set(violation.rule, counts);
    }
    return new MaintainabilityBaseline(sections).#withReasonsOf(reasons);
  }

  constructor(
    readonly sections: ReadonlyMap<DebtRuleId, Counts> = new Map(),
    readonly reasons: ReadonlyMap<string, string> = new Map(),
  ) {}

  get isEmpty() {
    return [...this.sections.values()].every((counts) => !counts.size);
  }

  allows(violation: MaintainabilityViolation) {
    const recorded = this.recordedOf(violation);
    return recorded !== undefined && MaintainabilityBaseline.countOf(violation) <= recorded;
  }

  recordedOf(violation: MaintainabilityViolation) {
    return this.sections.get(violation.rule)?.get(violation.key);
  }

  reasonOf(key: string) {
    const reason = this.#holdsReasoned(key) ? this.reasons.get(key) : undefined;
    return reason && reason.replace(/\s/g, "").length >= MaintainabilityBaseline.reasonMinChars ? reason : undefined;
  }

  entriesByRule() {
    return new Map(
      [...this.sections]
        .filter(([, counts]) => counts.size)
        .map(([rule, counts]): [DebtRuleId, BaselineEntry[]] => [
          rule,
          [...counts].map(([key, count]) => ({
            key,
            count,
            reason: MaintainabilityBaseline.reasonedRules.has(rule) ? this.reasonOf(key) : undefined,
          })),
        ]),
    );
  }

  tightenedBy(violations: MaintainabilityViolation[]) {
    const current = MaintainabilityBaseline.of(violations);
    const sections = new Map(
      [...this.sections].map(([rule, counts]) => [
        rule,
        MaintainabilityBaseline.#lowered(counts, current.sections.get(rule) ?? new Map()),
      ]),
    );
    return new MaintainabilityBaseline(sections).#withReasonsOf(this.reasons);
  }

  #withReasonsOf(reasons: ReadonlyMap<string, string>) {
    return new MaintainabilityBaseline(
      this.sections,
      new Map([...reasons].filter(([key]) => this.#holdsReasoned(key))),
    );
  }

  //* Only a shape entry grows with a reason: a write rule guards correctness, whatever the reason.
  grownFrom(committed: MaintainabilityBaseline): BaselineEntryGrowth[] {
    return [...this.sections].flatMap(([rule, counts]) =>
      MaintainabilityBaseline.#raised(counts, committed.sections.get(rule) ?? new Map())
        .filter(([key]) => !(MaintainabilityBaseline.reasonedRules.has(rule) && this.reasonOf(key)))
        .map(([key, count, recorded]) => ({ rule, key, count, committed: recorded })),
    );
  }

  stringify() {
    const sections = MaintainabilityBaseline.debtRules.flatMap((rule) => {
      const counts = this.sections.get(rule);
      return counts?.size ? [[rule, MaintainabilityBaseline.#sortedObjectOf(counts)] as const] : [];
    });
    return JsonFormatter.stringify(
      {
        ...Object.fromEntries(sections),
        ...(this.reasons.size ? { reasons: MaintainabilityBaseline.#sortedObjectOf(this.reasons) } : {}),
      },
      MaintainabilityBaseline.fileName,
    );
  }

  #holdsReasoned(key: string) {
    return [...this.sections].some(
      ([rule, counts]) => MaintainabilityBaseline.reasonedRules.has(rule) && counts.has(key),
    );
  }

  static #countsOf(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    return entries.every(([, count]) => Number.isInteger(count)) ? (entries as [string, number][]) : null;
  }

  static #reasonsOf(value: unknown) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    return entries.every(([, reason]) => typeof reason === "string") ? (entries as [string, string][]) : null;
  }

  static #lowered(recorded: Counts, current: Counts) {
    return new Map(
      [...recorded].flatMap(([key, count]) => {
        const measured = current.get(key);
        return measured === undefined ? [] : [[key, Math.min(count, measured)] as const];
      }),
    );
  }

  static #raised(working: Counts, committed: Counts) {
    return [...working].flatMap(([key, count]) => {
      const recorded = committed.get(key);
      return recorded !== undefined && count <= recorded ? [] : [[key, count, recorded] as const];
    });
  }

  static #sortedObjectOf<T>(values: ReadonlyMap<string, T>) {
    return Object.fromEntries([...values].sort(([a], [b]) => MaintainabilityBaseline.#byKey(a, b)));
  }

  static #byKey(a: string, b: string) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
}
