import { lowerlize } from "akanjs/common";
import { bilingualLabelForField, moduleComponentName, titleize } from "./source";

export interface MutationCall {
  ref: string;
  method: string;
  field: string | null;
  args: string[];
}

export interface MutationActingUser {
  argName: string;
  param: string;
  value: string;
  serviceParam: string;
}

export interface MutationSourceSpec {
  module: string;
  mutation: string;
  guards: readonly string[];
  acting: MutationActingUser | null;
  withCalls: readonly MutationCall[];
  afterCalls: readonly MutationCall[];
}

export class MutationSource {
  static readonly #irregularParticiples = new Map([
    ["bind", "bound"],
    ["build", "built"],
    ["choose", "chosen"],
    ["cut", "cut"],
    ["find", "found"],
    ["freeze", "frozen"],
    ["get", "got"],
    ["give", "given"],
    ["hide", "hidden"],
    ["hold", "held"],
    ["keep", "kept"],
    ["lead", "led"],
    ["leave", "left"],
    ["lose", "lost"],
    ["make", "made"],
    ["pay", "paid"],
    ["put", "put"],
    ["read", "read"],
    ["run", "run"],
    ["sell", "sold"],
    ["send", "sent"],
    ["set", "set"],
    ["show", "shown"],
    ["shut", "shut"],
    ["split", "split"],
    ["take", "taken"],
    ["win", "won"],
    ["write", "written"],
  ]);
  readonly spec: MutationSourceSpec;
  readonly modelClassName: string;
  readonly model: string;
  readonly idParam: string;
  readonly chainMethod: string;

  constructor(spec: MutationSourceSpec) {
    this.spec = spec;
    this.modelClassName = moduleComponentName(spec.module);
    this.model = lowerlize(this.modelClassName);
    this.idParam = `${this.model}Id`;
    this.chainMethod = MutationSource.chainMethodOf(spec.mutation, this.modelClassName);
  }

  static chainMethodOf(mutation: string, modelClassName: string) {
    const dropped = mutation.replace(modelClassName, "");
    return dropped && dropped !== mutation ? lowerlize(dropped) : mutation;
  }

  static participleOf(verb: string) {
    const irregular = MutationSource.#irregularParticiples.get(verb);
    if (irregular) return irregular;
    if (verb.endsWith("e")) return `${verb}d`;
    if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ied`;
    if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(verb)) return `${verb}${verb.at(-1)}ed`;
    return `${verb}ed`;
  }

  get isPublic() {
    return this.spec.guards.includes("Public");
  }

  get #verb() {
    return this.chainMethod.replace(/[A-Z].*$/s, "");
  }

  get #noun() {
    return titleize(this.model).toLowerCase();
  }

  get chainMethodBlock() {
    return [
      `  // any → ${MutationSource.participleOf(this.#verb)}.`,
      `  ${this.chainMethod}() {`,
      "    return this;",
      "  }",
    ].join("\n");
  }

  get serviceMethodBlock() {
    const params = [
      `${this.idParam}: string`,
      ...(this.spec.acting ? [`${this.spec.acting.serviceParam}: string`] : []),
    ];
    const load = `const ${this.model} = await this.get${this.modelClassName}(${this.idParam});`;
    const chained = `${this.model}.${this.chainMethod}().save()`;
    const head = `  async ${this.spec.mutation}(${params.join(", ")}) {`;
    if (!this.spec.withCalls.length && !this.spec.afterCalls.length)
      return [head, `    ${load}`, `    return await ${chained};`, "  }"].join("\n");
    return [
      head,
      "    return await this.transaction(async () => {",
      `      ${load}`,
      `      await ${chained};`,
      ...this.spec.withCalls.map((call) => `      await ${MutationSource.#callOf(call)};`),
      ...this.spec.afterCalls.map((call) => `      await this.afterCommit(() => ${MutationSource.#callOf(call)});`),
      `      return ${this.model};`,
      "    });",
      "  }",
    ].join("\n");
  }

  get signalEntry() {
    const options = this.isPublic
      ? `{ guards: [${this.spec.guards.join(", ")}], rateLimit: { calls: 20 } }`
      : `{ guards: [${this.spec.guards.join(", ")}] }`;
    const { acting } = this.spec;
    const execParams = [this.idParam, ...(acting ? [acting.param] : [])];
    const serviceArgs = [this.idParam, ...(acting ? [acting.value] : [])];
    return [
      `${this.spec.mutation}: mutation(cnst.${this.modelClassName}, ${options})`,
      `    .param("${this.idParam}", ID)`,
      ...(acting ? [`    .with(${acting.argName})`] : []),
      `    .exec(async function (${execParams.join(", ")}) {`,
      `      return await this.${this.model}Service.${this.spec.mutation}(${serviceArgs.join(", ")});`,
      "    }),",
    ].join("\n");
  }

  get storeActionBlock() {
    return [
      `  async ${this.spec.mutation}(${this.idParam}: string) {`,
      `    this.set${this.modelClassName}(await fetch.${this.spec.mutation}(${this.idParam}));`,
      "  }",
    ].join("\n");
  }

  get dictionaryEntry() {
    const label = bilingualLabelForField(this.spec.mutation);
    const modelLabel = bilingualLabelForField(this.model);
    const pair = (en: string, ko: string) => `[${JSON.stringify(en)}, ${JSON.stringify(ko)}]`;
    const idPair = pair(`${modelLabel.en} ID`, `${modelLabel.ko} ID`);
    return [
      `${this.spec.mutation}: fn(${pair(label.en, label.ko)})`,
      `      .desc(${pair(`API to ${label.en.toLowerCase()}`, `${label.ko} API`)})`,
      "      .arg((t) => ({",
      `        ${this.idParam}: t(${idPair}).desc(${idPair}),`,
      "      })),",
    ].join("\n");
  }

  get testTitles() {
    const guards = this.spec.guards.join(" and ");
    const participle = MutationSource.participleOf(this.#verb);
    return [
      `${this.spec.mutation} leaves the ${this.#noun} ${participle} for a caller ${guards} admits`,
      ...(this.spec.guards.every((guard) => guard === "Public")
        ? []
        : [`${this.spec.mutation} refuses a caller ${guards} turns away`]),
    ];
  }

  testCaseLines(itName: string, indent: string) {
    return this.testTitles.map((title) => `${indent}${itName}.todo(${JSON.stringify(title)});`);
  }

  get testFile() {
    return [
      'import { describe, it } from "bun:test";',
      "",
      `describe(${JSON.stringify(`${this.modelClassName} Signal`)}, () => {`,
      ...this.testCaseLines("it", "  "),
      "});",
      "",
    ].join("\n");
  }

  static #callOf(call: MutationCall) {
    const target = call.field ? `this.${call.field}` : "this";
    return `${target}.${call.method}(${call.args.join(", ")})`;
  }
}
