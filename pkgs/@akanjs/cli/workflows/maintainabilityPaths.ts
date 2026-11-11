import { camelToKebabCase } from "@akanjs/devkit/commandDecorators/camelToKebabCase";
import {
  type MaintainabilityCommands,
  MaintainabilityContract,
  type MaintainabilityRuleId,
} from "@akanjs/devkit/quality/maintainabilityContract";
import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { workflowSpecs } from "./index";
import { sysInputs } from "./shared";

export class MaintainabilityPaths {
  static readonly pathless: ReadonlySet<MaintainabilityRuleId> = new Set([
    "akan.size.file",
    "akan.size.component",
    "akan.size.function",
    "akan.size.class",
    "akan.service.call-in-loop",
    "akan.error.bare-error",
    "akan.baseline.growth",
  ]);
  readonly #specs: readonly WorkflowSpec[];

  constructor(specs: readonly WorkflowSpec[] = workflowSpecs) {
    this.#specs = specs;
  }

  static isRule(rule: string): rule is MaintainabilityRuleId {
    return (MaintainabilityContract.ruleIds as readonly string[]).includes(rule);
  }

  commandsOf(target: string): MaintainabilityCommands {
    const commands: { [rule in MaintainabilityRuleId]?: string[] } = {};
    for (const spec of this.#specs)
      for (const rule of (spec.replacesRules ?? []).filter(MaintainabilityPaths.isRule))
        commands[rule] = [...(commands[rule] ?? []), MaintainabilityPaths.#planOf(spec, target)];
    return commands;
  }

  static #planOf(spec: WorkflowSpec, target: string) {
    const flags = Object.entries(spec.inputs)
      .filter(([, input]) => input.required)
      .map(([name]) => {
        const flag = camelToKebabCase(name);
        return `--${flag} ${name in sysInputs ? target : `<${flag}>`}`;
      });
    return ["akan workflow plan", spec.name, ...flags].join(" ");
  }
}
