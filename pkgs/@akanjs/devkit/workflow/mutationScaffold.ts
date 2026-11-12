import { lowerlize, modelNames } from "akanjs/common";
import type { Sys } from "../commandDecorators";
import { hasDictionaryEndpointEntry, insertDictionaryEndpointEntry } from "./dictionarySource";
import { GuardCatalog } from "./guardCatalog";
import { moduleComponentName, moduleSourcePaths } from "./modulePaths";
import { type MutationActingUser, type MutationCall, MutationSource } from "./mutationSource";
import { classMethodParameters, hasClassMethod, insertClassMethod } from "./serviceSource";
import { hasSignalFactoryEntry, insertSignalFactoryEntry } from "./signalSource";
import { hasSourceParseErrors } from "./sourceAst";
import { ensureImportDeclaration, ensureNamedImport } from "./sourceImports";
import { appendTopLevelTestCases } from "./testSource";
import type { ScaffoldFile, WorkflowDiagnostic, WorkflowRecommendation } from "./types";

export interface MutationScaffoldInput {
  module: string | null;
  mutation: string | null;
  guards?: readonly string[] | null;
  withCalls?: readonly string[] | null;
  afterCalls?: readonly string[] | null;
}

interface ResolvedCall extends MutationCall {
  injection: { field: string; typeRef: string } | null;
}

interface ServiceSource {
  className: string;
  content: string;
  typeRef: string;
}

export class MutationScaffold {
  static readonly #documentMethods = new Set(["isModified", "refresh", "remove", "save", "set", "toJSON", "toObject"]);
  static readonly #serviceMethods = new Set(["afterCommit", "logger", "onDestroy", "onInit", "transaction"]);
  static readonly #callPattern = /^_?([a-z][A-Za-z0-9]*)\.([A-Za-z_$][\w$]*)$/;
  readonly #sys: Sys;
  readonly #catalog: GuardCatalog;
  readonly #strict: boolean;
  readonly #diagnostics: WorkflowDiagnostic[] = [];

  constructor(sys: Sys, catalog: GuardCatalog, { strict }: { strict: boolean }) {
    this.#sys = sys;
    this.#catalog = catalog;
    this.#strict = strict;
  }

  static reservedNamesOf(modelClassName: string) {
    const names = modelNames(lowerlize(modelClassName));
    return new Set([
      names.model,
      names.lightModel,
      names.createModel,
      names.updateModel,
      names.removeModel,
      names.viewModel,
      names.editModel,
      names.mergeModel,
      names.getModel,
      names.loadModel,
      names.setModel,
      names.resetModel,
      names.newModel,
      names.submitModel,
      names.invalidateModel,
      names.createModelInForm,
      names.updateModelInForm,
      names.loadModelMany,
      names.getModelView,
      names.getModelEdit,
      names.addModelFiles,
      names.checkModelSubmitable,
      names.writeOnModel,
      names.loadModelFormDraft,
      names.restoreModelFormDraft,
      names.discardModelFormDraft,
    ]);
  }

  static generates(modelClassName: string, name: string) {
    return (
      MutationScaffold.reservedNamesOf(modelClassName).has(name) ||
      new RegExp(`^(init${modelClassName}|get${modelClassName}Init|(set|add|sub|upload)\\w+On${modelClassName}$)`).test(
        name,
      )
    );
  }

  static inputDiagnostics(input: MutationScaffoldInput): WorkflowDiagnostic[] {
    const diagnostics: WorkflowDiagnostic[] = [];
    const error = (code: string, inputName: string, message: string) =>
      diagnostics.push({ severity: "error", code, input: inputName, message });
    const { module, mutation } = input;
    if (mutation && !/^[a-z][A-Za-z0-9]*$/.test(mutation))
      error("add-mutation-name-invalid", "mutation", `Mutation name "${mutation}" must be a camelCase identifier.`);
    if (module && mutation) {
      const modelClassName = moduleComponentName(module);
      if (MutationScaffold.generates(modelClassName, mutation))
        error(
          "add-mutation-name-reserved",
          "mutation",
          `"${mutation}" collides with a name Akan generates for ${modelClassName} (CRUD endpoints, store actions, form setters). Name the act, e.g. archive${modelClassName}.`,
        );
      const chainMethod = MutationSource.chainMethodOf(mutation, modelClassName);
      if (MutationScaffold.#documentMethods.has(chainMethod))
        error(
          "add-mutation-name-reserved",
          "mutation",
          `"${mutation}" drops to the document chain method ${chainMethod}(), which every document already has.`,
        );
      else if (MutationScaffold.#serviceMethods.has(chainMethod))
        error(
          "add-mutation-name-reserved",
          "mutation",
          `"${mutation}" drops to the service method ${chainMethod}(), which every service already has.`,
        );
    }
    const guards = input.guards ?? [];
    if (!guards.length)
      error(
        "add-mutation-guard-missing",
        "guard",
        "Name the guard(s) that admit a caller (guard=Admin, guard=Every,Person); add-mutation has no default guard.",
      );
    for (const guard of guards) {
      if (guard === "None")
        error(
          "add-mutation-guard-none",
          "guard",
          "None answers no caller, so the endpoint would ship dead; name the guard that admits the intended caller.",
        );
      else if (!/^[A-Z][A-Za-z0-9]*$/.test(guard))
        error("add-mutation-guard-invalid", "guard", `Guard "${guard}" must be a guard class name.`);
    }
    for (const [inputName, calls] of [
      ["with", input.withCalls],
      ["after", input.afterCalls],
    ] as const) {
      for (const call of calls ?? [])
        if (!MutationScaffold.#callPattern.test(call))
          error(
            "add-mutation-call-invalid",
            inputName,
            `"${call}" must name a service method as <serviceRef>.<method>, e.g. courtPc.pushPcCommand.`,
          );
    }
    return diagnostics;
  }

  static async build(sys: Sys, input: MutationScaffoldInput, { strict = true }: { strict?: boolean } = {}) {
    return await new MutationScaffold(sys, await GuardCatalog.load(sys), { strict }).#build(input);
  }

  async #build(input: MutationScaffoldInput) {
    const files: ScaffoldFile[] = [];
    const recommendations: WorkflowRecommendation[] = [];
    this.#diagnostics.push(...MutationScaffold.inputDiagnostics(input));
    const { module, mutation } = input;
    const guards = [...new Set(input.guards ?? [])];
    const guardSpecifiers = this.#resolveGuards(guards);
    if (this.#hasGuardError())
      recommendations.push({
        code: "add-mutation-guard-choices",
        kind: "input-guidance",
        confidence: "high",
        message: `Guards this target reaches: ${this.#catalog.names.join(", ") || "none"}.`,
        action: "Re-plan with guard set to one or more of these names.",
      });
    if (!module || !mutation || this.#hasError()) return this.#result(files, recommendations);

    const paths = moduleSourcePaths(module);
    const sourcePaths = [paths.document, paths.service, paths.signal, paths.store, paths.dictionary];
    const present = await Promise.all(sourcePaths.map((path) => this.#sys.exists(path)));
    const missing = sourcePaths.filter((_, idx) => !present[idx]);
    if (missing.length) {
      this.#report(
        "add-mutation-module-missing",
        `Module ${module} lacks ${missing.join(", ")}; add-mutation writes into an existing database module (create-module first).`,
        { input: "module" },
      );
      return this.#result(files, recommendations);
    }

    const acting = this.#catalog.actingUserOf(guards);
    if (acting)
      recommendations.push({
        code: "add-mutation-ownership",
        kind: "manual-action",
        confidence: "high",
        message: `${guards.join(" and ")} admits any signed-in caller, so the service receives ${acting.serviceParam} and a TODO where it must refuse a caller who may not act on this ${module}.`,
        action: `Check ${acting.serviceParam} against the ${module} before the chain, or guard the mutation with a Can<Verb><Model> resource guard.`,
      });
    const source = new MutationSource({
      module,
      mutation,
      guards,
      acting,
      withCalls: [],
      afterCalls: [],
    });
    const [document, service, signal, store, dictionary] = await Promise.all(
      sourcePaths.map((path) => this.#sys.readFile(path)),
    );
    await this.#checkNameFree(source, { service, signal, store, dictionary });
    const withCalls = await this.#resolveCalls(source, input.withCalls ?? [], "with", acting);
    const afterCalls = await this.#resolveCalls(source, input.afterCalls ?? [], "after", acting);
    if (this.#hasError()) return this.#result(files, recommendations);

    const shaped = new MutationSource({ module, mutation, guards, acting, withCalls, afterCalls });
    const testPath = `lib/${module}/${module}.signal.test.ts`;
    const testExists = await this.#sys.exists(testPath);
    const edits: [string, string | null, string, ScaffoldFile["action"]][] = [
      [paths.document, this.#editDocument(document, shaped), "Document chain method was added.", "modify"],
      [
        paths.service,
        this.#editService(service, shaped, [...withCalls, ...afterCalls]),
        "Service mutation was added.",
        "modify",
      ],
      [paths.signal, this.#editSignal(signal, shaped, guardSpecifiers, acting), "Signal mutation was added.", "modify"],
      [paths.store, this.#editStore(store, shaped), "Store action was added.", "modify"],
      [paths.dictionary, this.#editDictionary(dictionary, shaped), "Dictionary endpoint entry was added.", "modify"],
      [
        testPath,
        testExists
          ? appendTopLevelTestCases(
              await this.#sys.readFile(testPath),
              `${shaped.modelClassName} Signal`,
              (itName, indent) => shaped.testCaseLines(itName, indent),
            )
          : shaped.testFile,
        "Signal test placeholders were added.",
        testExists ? "modify" : "create",
      ],
    ];
    for (const [path, content, reason, action] of edits) {
      if (content === null) continue;
      if (hasSourceParseErrors(content, path))
        this.#report("add-mutation-post-edit-parse-failed", `Edited ${path} did not parse; refusing to write source.`, {
          severity: "error",
        });
      files.push({ path, content, reason, action });
    }
    return this.#result(files, recommendations);
  }

  #result(files: ScaffoldFile[], recommendations: WorkflowRecommendation[]) {
    const diagnostics = this.#diagnostics;
    return { diagnostics, recommendations, files: this.#hasError() ? [] : files };
  }

  #hasError() {
    return this.#diagnostics.some((diagnostic) => diagnostic.severity === "error");
  }

  #hasGuardError() {
    return this.#diagnostics.some((diagnostic) => diagnostic.code.startsWith("add-mutation-guard"));
  }

  #report(
    code: string,
    message: string,
    { input, severity }: { input?: string; severity?: WorkflowDiagnostic["severity"] } = {},
  ) {
    this.#diagnostics.push({
      severity: severity ?? (this.#strict ? "error" : "warning"),
      code,
      message,
      input,
      failureScope: "source-change",
    });
  }

  #resolveGuards(guards: readonly string[]) {
    const specifiers = new Map<string, string>();
    for (const guard of guards) {
      if (guard === "None") continue;
      const { specifier, ambiguous } = this.#catalog.resolve(guard);
      if (ambiguous)
        this.#report("add-mutation-guard-ambiguous", `Guard "${guard}" is exported by ${ambiguous.join(" and ")}.`, {
          input: "guard",
          severity: "error",
        });
      else if (!specifier)
        this.#report(
          "add-mutation-guard-unknown",
          `Guard "${guard}" is not exported by ${this.#sys.type}s/${this.#sys.name}/srvkit, the srvkit of a lib it reaches (${this.#catalog.reachedLibs.join(", ") || "none"}), or akanjs/signal.`,
          { input: "guard", severity: "error" },
        );
      else specifiers.set(guard, specifier);
    }
    return specifiers;
  }

  async #checkNameFree(source: MutationSource, files: Record<"service" | "signal" | "store" | "dictionary", string>) {
    const { mutation } = source.spec;
    const { modelClassName } = source;
    const taken = [
      hasClassMethod(files.service, `${modelClassName}Service`, source.serviceMethod) &&
        `${modelClassName}Service.${source.serviceMethod}()`,
      ["Internal", "Slice", "Endpoint"].some((kind) =>
        hasSignalFactoryEntry(files.signal, `${modelClassName}${kind}`, mutation),
      ) && `${source.spec.module}.signal.ts`,
      hasClassMethod(files.store, `${modelClassName}Store`, mutation) && `${modelClassName}Store`,
      hasDictionaryEndpointEntry(files.dictionary, modelClassName, mutation) && `${source.spec.module}.dictionary.ts`,
      ...(await this.#signalsDeclaring(mutation, source.spec.module)),
    ].filter((place): place is string => !!place);
    if (taken.length)
      this.#report("add-mutation-name-exists", `"${mutation}" already exists in ${taken.join(", ")}.`, {
        input: "mutation",
        severity: "error",
      });
  }

  //? Every store is mixed into one root and every endpoint into one `fetch`, so a name another module or a reached lib
  //? generates or declares refuses to boot (`[DI:fetch]`) however far away it lives.
  async #signalsDeclaring(mutation: string, ownModule: string) {
    const pattern = new RegExp(`^\\s*${mutation}:\\s*(mutation|query|pubsub|message)\\(`, "m");
    const roots = [`${this.#sys.type}s/${this.#sys.name}`, ...this.#catalog.reachedLibs.map((lib) => `libs/${lib}`)];
    const hits = await Promise.all(
      roots.map(async (root) => {
        if (!(await this.#sys.workspace.exists(`${root}/lib`))) return [];
        const folders = (await this.#sys.workspace.readdir(`${root}/lib`)).filter(
          (folder) => !folder.includes(".") && !folder.startsWith("__") && !(root === roots[0] && folder === ownModule),
        );
        return await Promise.all(
          folders.map(async (folder) => {
            const name = folder.replace(/^_+/, "");
            const base = `${root}/lib/${folder}/${name}`;
            if (
              (await this.#sys.workspace.exists(`${base}.document.ts`)) &&
              MutationScaffold.generates(moduleComponentName(name), mutation)
            )
              return `${root}/lib/${folder} (generated for ${moduleComponentName(name)})`;
            if (!(await this.#sys.workspace.exists(`${base}.signal.ts`))) return null;
            return pattern.test(await this.#sys.workspace.readFile(`${base}.signal.ts`)) ? `${base}.signal.ts` : null;
          }),
        );
      }),
    );
    return hits.flat().filter((hit): hit is string => !!hit);
  }

  async #resolveCalls(
    source: MutationSource,
    calls: readonly string[],
    inputName: "with" | "after",
    acting: MutationActingUser | null,
  ) {
    const resolved: ResolvedCall[] = [];
    for (const call of calls) {
      const [rawRef = "", method = ""] = call.split(".");
      const ref = rawRef.replace(/^_+/, "");
      const isOwn = ref === source.model;
      const service = await this.#serviceSourceOf(ref, isOwn);
      if (!service) {
        this.#report(
          "add-mutation-call-service-missing",
          `${inputName}: no ${moduleComponentName(ref)}Service in ${this.#sys.name} or the libs it reaches.`,
          { input: inputName },
        );
        continue;
      }
      const params = this.#parametersOf(service, ref, method);
      if (!params) {
        this.#report("add-mutation-call-method-missing", `${inputName}: ${service.className} has no ${method}().`, {
          input: inputName,
        });
        continue;
      }
      const scope = new Map<string, string>([
        [source.idParam, `${source.model}.id`],
        [source.model, source.model],
        ...(isOwn ? [["id", `${source.model}.id`] as [string, string]] : []),
        ...(acting ? [[acting.serviceParam, acting.serviceParam] as [string, string]] : []),
      ]);
      const args: string[] = [];
      for (const param of params) {
        const value = param.name ? scope.get(param.name) : undefined;
        if (value) {
          args.push(value);
          continue;
        }
        if (!param.optional)
          this.#report(
            "add-mutation-call-args-unresolved",
            `${inputName}: ${service.className}.${method}() takes "${param.name ?? "?"}", which add-mutation cannot supply. Name a method taking the ${source.model}, its id or the acting user, or call this one by hand after apply.`,
            { input: inputName, severity: "error" },
          );
        break;
      }
      const field = isOwn ? null : `${ref}Service`;
      resolved.push({
        ref,
        method,
        field,
        args,
        injection: field ? { field, typeRef: service.typeRef } : null,
      });
    }
    return resolved;
  }

  async #serviceSourceOf(ref: string, isOwn: boolean): Promise<ServiceSource | null> {
    const className = `${moduleComponentName(ref)}Service`;
    const scopes = [
      { root: `${this.#sys.type}s/${this.#sys.name}`, typeRef: `srv.${className}` },
      ...(isOwn
        ? []
        : this.#catalog.reachedLibs.map((lib) => ({ root: `libs/${lib}`, typeRef: `srv.${lib}.${className}` }))),
    ];
    for (const { root, typeRef } of scopes) {
      for (const folder of [ref, `_${ref}`]) {
        const path = `${root}/lib/${folder}/${ref}.service.ts`;
        if (await this.#sys.workspace.exists(path))
          return { className, typeRef, content: await this.#sys.workspace.readFile(path) };
      }
    }
    return null;
  }

  #parametersOf(service: ServiceSource, ref: string, method: string) {
    const declared = classMethodParameters(service.content, service.className, method);
    if (declared) return declared;
    const names = modelNames(lowerlize(moduleComponentName(ref)));
    const generated: Record<string, { name: string; optional: boolean }[]> = {
      [names.getModel]: [{ name: "id", optional: false }],
      [names.loadModel]: [{ name: "id", optional: true }],
      [names.loadModelMany]: [{ name: "ids", optional: false }],
      [names.createModel]: [{ name: "data", optional: false }],
      [names.updateModel]: [
        { name: "id", optional: false },
        { name: "data", optional: false },
      ],
      [names.removeModel]: [{ name: "id", optional: false }],
    };
    return generated[method] ?? null;
  }

  #editDocument(content: string, source: MutationSource) {
    if (hasClassMethod(content, source.modelClassName, source.chainMethod)) {
      this.#report(
        "add-mutation-chain-method-reused",
        `${source.modelClassName}.${source.chainMethod}() already exists; the service chains it as is.`,
        { severity: "warning" },
      );
      return null;
    }
    return this.#required(
      insertClassMethod(content, source.modelClassName, source.chainMethodBlock),
      `class ${source.modelClassName} in the document`,
    );
  }

  #editService(content: string, source: MutationSource, calls: readonly ResolvedCall[]) {
    const className = `${source.modelClassName}Service`;
    let next: string | null = content;
    for (const { injection } of calls) {
      if (!next || !injection || hasSignalFactoryEntry(next, className, injection.field)) continue;
      next = insertSignalFactoryEntry(
        next,
        className,
        injection.field,
        `${injection.field}: service<${injection.typeRef}>(),`,
        {
          mode: "destructure",
          name: "service",
        },
      );
      if (next && !/\* as srv from "\.\.\/srv";/.test(next))
        next = ensureImportDeclaration(next, "../srv", "type * as srv");
    }
    next = next && insertClassMethod(next, className, source.serviceMethodBlock);
    return this.#required(next, `${className} and its serve() factory`);
  }

  #editSignal(
    content: string,
    source: MutationSource,
    guardSpecifiers: ReadonlyMap<string, string>,
    acting: (MutationActingUser & { specifier: string }) | null,
  ) {
    let next = insertSignalFactoryEntry(
      content,
      `${source.modelClassName}Endpoint`,
      source.spec.mutation,
      source.signalEntry,
      { mode: "destructure", name: "mutation" },
    );
    if (!next) return this.#required(next, `${source.modelClassName}Endpoint and its endpoint() factory`);
    next = ensureNamedImport(next, "akanjs/base", "ID");
    if (!/\* as cnst from "\.\.\/cnst";/.test(next)) next = ensureImportDeclaration(next, "../cnst", "* as cnst");
    for (const [guard, specifier] of guardSpecifiers) next = ensureNamedImport(next, specifier, guard);
    if (acting) next = ensureNamedImport(next, acting.specifier, acting.argName);
    return next;
  }

  #editStore(content: string, source: MutationSource) {
    const next = insertClassMethod(content, `${source.modelClassName}Store`, source.storeActionBlock);
    return this.#required(next && ensureNamedImport(next, "../useClient", "fetch"), `${source.modelClassName}Store`);
  }

  #editDictionary(content: string, source: MutationSource) {
    return this.#required(
      insertDictionaryEndpointEntry(
        content,
        source.modelClassName,
        source.spec.mutation,
        source.dictionaryEntryOf(MutationScaffold.#modelKoOf(content)),
      ),
      `.endpoint<${source.modelClassName}Endpoint>() in the dictionary`,
    );
  }

  static #modelKoOf(dictionary: string) {
    return dictionary.match(/\.of\(\s*\(t\)\s*=>\s*t\(\s*\[\s*"[^"]*"\s*,\s*"([^"]+)"\s*\]/)?.[1];
  }

  #required(content: string | null, shape: string) {
    if (!content)
      this.#report("add-mutation-shape-unsupported", `Could not find ${shape}; refusing to write source.`, {
        severity: "error",
      });
    return content;
  }
}
