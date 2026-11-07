import { AbstractDoc } from "./abstractDoc";
import type {
  DebtRuleId,
  MaintainabilityCommands,
  MaintainabilityFailure,
  MaintainabilityRuleId,
} from "./maintainabilityContract";
import { type FileKind, MaintainabilityLimits } from "./maintainabilityLimits";

type FixKey = FileKind | Exclude<MaintainabilityRuleId, "akan.size.file">;

export class MaintainabilityReport {
  static readonly #clientSplitFix =
    'Split it, in this order: a mode/kind table `{ [kind in cnst.X["value"]]: … }` in place of mode flags, each entry a component of the module owning the data of that kind; an interaction hook in `webkit/use<X>.tsx` with its pure logic in `common/` (`akan workflow plan create-interaction`); the writes behind one endpoint (`akan workflow plan add-mutation`); last, a sub-concept in its own module (`lib/<sub>` or `lib/_<feature>`), never model-bound code moved into `ui/`.';
  static readonly #serverMarkupFix =
    "Move model-independent pieces into ui/ components and display logic onto Light<Model>.";
  static readonly #oneEndpointFix =
    "Make it one service method that runs the writes inside `this.transaction(fn)`, with a side effect such as a push command in `this.afterCommit(fn)`, behind one endpoint the action calls once; a write per item becomes one endpoint taking the list. An MCP agent or another screen calling one endpoint alone skips the rest.";
  static readonly #fixes: { [key in FixKey]: string } = {
    ".Template.tsx": MaintainabilityReport.#clientSplitFix,
    ".Unit.tsx": MaintainabilityReport.#serverMarkupFix,
    ".Util.tsx": MaintainabilityReport.#clientSplitFix,
    ".View.tsx": MaintainabilityReport.#serverMarkupFix,
    ".Zone.tsx": MaintainabilityReport.#clientSplitFix,
    "ui/": MaintainabilityReport.#clientSplitFix,
    "webkit/": MaintainabilityReport.#clientSplitFix,
    ".store.ts":
      "Move business logic into the service behind an endpoint and derived values onto Light<Model>; an action is fetch, set, toast.",
    ".document.ts":
      "Move display and predicate logic onto Light<Model>, and split an unrelated concept into its own module.",
    ".service.ts":
      "Move state transitions into document chain methods, and split an unrelated responsibility into its own module.",
    [AbstractDoc.suffix]:
      "Trim the abstract to a title, one sentence naming what the module owns, and a `## Rules` list of the invariants the code cannot show.",
    "akan.size.component": MaintainabilityReport.#clientSplitFix,
    "akan.store.multi-write": MaintainabilityReport.#oneEndpointFix,
    "akan.store.root-write-chain": `A store may call another through \`RootStore\`, but that does not make the writes one. ${MaintainabilityReport.#oneEndpointFix}`,
    "akan.component.write-chain":
      "Move the writes into one service method behind one endpoint, called by one store action the handler calls once; a component chaining `st.do` writes, or writing once per item, leaves an agent or another screen half-done.",
    "akan.component.store-access": MaintainabilityReport.#clientSplitFix,
    "akan.write.placement":
      "A server write leaves the browser through one store action, started by one module component. Move a `fetch.<mutation>` into a store action, and hand `ui/` and `webkit/` code the write as an `onX` prop or hook argument from the module's `Zone` or `Util`: they stay free of any one model, and an agent or another screen reaches the write through the store.",
    "akan.service.call-in-loop":
      "Load the set once (`load<Model>Many(ids)`, one filter query) or write it once (one batch method), then loop in memory: a call per item is a round trip per item, so the endpoint slows as its input grows.",
    "akan.baseline.growth":
      "Restore the entry from the default branch, then split the file or move the writes instead: `akan lint` lowers an entry as the code shrinks and never raises one.",
  };

  static readonly #labels: { [key in FixKey]?: string } = {
    "ui/": "ui/**",
    "webkit/": "webkit/**",
    "akan.size.component": "component or hook",
    "akan.store.multi-write": "store action with several writes",
    "akan.store.root-write-chain": "store method chaining other stores' writes",
    "akan.component.write-chain": "handler with several writes",
    "akan.component.store-access": "component or hook reaching the store often",
    "akan.write.placement": "write sent outside a store action or module component",
    "akan.service.call-in-loop": "service call per item",
    "akan.baseline.growth": "baseline entry",
  };

  static readonly #units: { [rule in DebtRuleId]: string } = {
    "akan.size.file": "lines",
    "akan.size.component": "lines",
    "akan.component.store-access": "store accesses",
    "akan.store.multi-write": "writes",
    "akan.store.root-write-chain": "writes",
    "akan.component.write-chain": "writes",
    "akan.write.placement": "writes",
    "akan.service.call-in-loop": "calls per item",
  };

  static describe(sysPath: string, failures: MaintainabilityFailure[], commands: MaintainabilityCommands = {}) {
    const groups = new Map<string, { labels: string[]; rules: Set<MaintainabilityRuleId> }>();
    for (const failure of failures) {
      const fixKey = MaintainabilityReport.#fixKeyOf(failure);
      const fix = MaintainabilityReport.#fixes[fixKey];
      const group = groups.get(fix) ?? { labels: [], rules: new Set() };
      const label = MaintainabilityReport.#labelOf(fixKey);
      if (!group.labels.includes(label)) group.labels.push(label);
      group.rules.add(failure.rule);
      groups.set(fix, group);
    }
    return [
      `[maintainability] ${failures.length} violation(s) in ${sysPath}:`,
      ...failures.map(
        (failure) =>
          `  ${sysPath}/${failure.file}:${failure.line}  ${failure.rule}  ${MaintainabilityReport.#problemOf(failure)}`,
      ),
      "How to fix:",
      ...[...groups].flatMap(([fix, { labels, rules }]) => [
        `  ${labels.join(", ")}: ${fix}`,
        ...[...new Set([...rules].flatMap((rule) => commands[rule] ?? []))].map((command) => `    Path: ${command}`),
      ]),
    ].join("\n");
  }

  static entriesOf(sysPath: string, failures: MaintainabilityFailure[], commands: MaintainabilityCommands = {}) {
    return failures.map((failure) => ({
      file: `${sysPath}/${failure.file}`,
      line: failure.line,
      rule: failure.rule,
      problem: MaintainabilityReport.#problemOf(failure),
      fix: MaintainabilityReport.#fixes[MaintainabilityReport.#fixKeyOf(failure)],
      path: commands[failure.rule]?.[0] ?? null,
    }));
  }

  static #problemOf(failure: MaintainabilityFailure) {
    if (failure.kind === "baselineGrowth") {
      const entry = `entry "${failure.key}" under ${failure.debtRule}`;
      return failure.committed === undefined
        ? `${entry} is not in the baseline at ${failure.reference}, which may only shrink`
        : `${entry} allows ${failure.count} ${MaintainabilityReport.#units[failure.debtRule]}, above the ${failure.committed} at ${failure.reference}; the baseline may only shrink`;
    }
    const grown = failure.recorded === undefined ? "" : `, more than the ${failure.recorded} recorded`;
    if (failure.kind === "multiWrite") {
      const writes = failure.writes.some((write) => write.endsWith("(per item)"))
        ? "a write per item"
        : `${failure.writes.length} writes`;
      const listed = `${failure.writes.join(", ")}${grown}`;
      if (failure.rule === "akan.component.write-chain")
        return `${MaintainabilityReport.#unitOf(failure.owner)} ${failure.owner} sends ${writes} from one handler: ${listed}`;
      if (failure.rule === "akan.store.root-write-chain")
        return `store method ${failure.owner} chains ${writes} through other stores from the browser: ${listed}`;
      return `store action ${failure.owner} sends ${writes} from the browser: ${listed}`;
    }
    if (failure.kind === "writePlacement")
      return `sends ${failure.writes.length} server write(s) from outside a store action or a module component: ${failure.writes.join(", ")}${grown}`;
    if (failure.kind === "loopCall")
      return `service method ${failure.owner} calls once per item: ${failure.calls.join(", ")}${grown}`;
    if (failure.kind === "storeAccess")
      return `${MaintainabilityReport.#unitOf(failure.component)} ${failure.component} reaches the store ${failure.accessCount} times, over the ${failure.maxAccesses}-access limit${failure.recorded === undefined ? "" : `, up from ${failure.recorded}`}`;
    const subject = failure.component
      ? `${MaintainabilityReport.#unitOf(failure.component)} ${failure.component} has`
      : "file has";
    const up = failure.recorded === undefined ? "" : `, up from ${failure.recorded}`;
    return `${subject} ${failure.lineCount} lines, over the ${failure.maxLines}-line limit${up}`;
  }

  static #unitOf(name: string) {
    return /^use[A-Z]/.test(name) ? "hook" : "component";
  }

  static #fixKeyOf(failure: MaintainabilityFailure): FixKey {
    if (failure.rule !== "akan.size.file") return failure.rule;
    return MaintainabilityLimits.fileKindOf(failure.file) ?? "akan.size.component";
  }

  static #labelOf(fixKey: FixKey) {
    return MaintainabilityReport.#labels[fixKey] ?? `*${fixKey}`;
  }
}
