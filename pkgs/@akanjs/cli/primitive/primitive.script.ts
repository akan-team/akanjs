import { type Sys, script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, LibExecutor, ModuleExecutor } from "@akanjs/devkit/executors";
import {
  type AddEnumFieldInput,
  type AddFieldInput,
  type AddMutationInput,
  type AddSliceInput,
  addFieldUiPolicyForType,
  type CreateInteractionInput,
  coerceFieldDefault,
  compactDiagnostics,
  createPrimitiveWriteReport,
  ensureBaseImport,
  ensureBaseTypeImport,
  ensureConstantTypeImport,
  ensureEnumImport,
  ensureNamedImport,
  type FactoryParamPlan,
  fieldExpression,
  generatedFilePathsForTarget,
  generatedFilesForSync,
  hasClassMethod,
  hasConstantInputField,
  hasDictionaryModelField,
  hasSignalFactoryEntry,
  hasSourceParseErrors,
  InteractionScaffold,
  insertClassMethod,
  insertDictionaryEnum,
  insertDictionaryModelField,
  insertEnumClass,
  insertIntoObject,
  insertLightProjectionField,
  insertSignalFactoryEntry,
  insertTemplateField,
  KeyRename,
  MutationScaffold,
  moduleComponentName,
  moduleSourcePaths,
  nextActionsForTarget,
  normalizeFieldType,
  type PrimitiveChangedFile,
  type PrimitiveTargetInput,
  parseValues,
  type RenameKeyInput,
  type ScaffoldFile,
  sourceFile,
  type UiSurface,
  validationCommandsForTarget,
  viaBuilderParameterName,
  type WorkflowDiagnostic,
  workflowStatus,
} from "@akanjs/devkit/workflow";
import { capitalize, lowerlize } from "akanjs/common";
import { ModuleScript } from "../module/module.script";

export class PrimitiveScript extends script("primitive", [ModuleScript]) {
  async resolveSys(workspace: Workspace, target: string | null): Promise<Sys | null> {
    if (!target) return null;
    const [apps, libs] = await workspace.getSyss();
    if (apps.includes(target)) return AppExecutor.from(workspace, target);
    if (libs.includes(target)) return LibExecutor.from(workspace, target);
    return null;
  }

  async createUi(workspace: Workspace, input: PrimitiveTargetInput & { surface: UiSurface }) {
    const sys = await this.resolveSys(workspace, input.app);
    if (!sys || !input.module)
      return PrimitiveScript.#refuse(
        "create-ui",
        compactDiagnostics([
          !sys && PrimitiveScript.#targetMissing(),
          !input.module && PrimitiveScript.#inputMissing("module"),
        ]),
      );
    const mod = ModuleExecutor.from(sys, input.module);
    if (input.surface === "view") return await this.moduleScript.createView(mod);
    if (input.surface === "unit") return await this.moduleScript.createUnit(mod);
    return await this.moduleScript.createTemplate(mod);
  }

  async addField(workspace: Workspace, input: AddFieldInput) {
    return await this.addFieldToSources(workspace, input, { enumValues: null });
  }

  async addEnumField(workspace: Workspace, input: AddEnumFieldInput) {
    const values = parseValues(input.values);
    return await this.addFieldToSources(
      workspace,
      { ...input, type: `${capitalize(input.field ?? "")}` },
      { enumValues: values },
    );
  }

  async addFieldToSources(workspace: Workspace, input: AddFieldInput, { enumValues }: { enumValues: string[] | null }) {
    const command = enumValues ? "add-enum-field" : "add-field";
    const sys = await this.resolveSys(workspace, input.app);
    const ambiguousNumberTypes = new Set(["number", "numeric"]);
    const normalizedType = input.type ? normalizeFieldType(input.type) : null;
    const diagnostics = compactDiagnostics([
      !sys && PrimitiveScript.#targetMissing(),
      !input.module && PrimitiveScript.#inputMissing("module"),
      !input.field && PrimitiveScript.#inputMissing("field"),
      !input.type && PrimitiveScript.#inputMissing("type"),
      enumValues?.length === 0 && PrimitiveScript.#inputMissing("values", "Enum values are required."),
      input.type && ambiguousNumberTypes.has(input.type.toLowerCase())
        ? {
            severity: "error",
            code: "primitive-field-type-unsupported",
            message: `Field type "${input.type}" is ambiguous in Akan. Use Int for integer fields or Float for decimal fields.`,
            input: "type",
          }
        : null,
      input.type && input.type.toLowerCase() === "upload"
        ? {
            severity: "error",
            code: "primitive-field-type-upload-misuse",
            message:
              "Upload is not a model field type. Declare an image/file field as a relation to the File model (e.g. field(File)); Upload is only valid in a { fileUpload: true } signal body. Note the File model is provided by the shared file library.",
            input: "type",
          }
        : null,
    ] as WorkflowDiagnostic[]);
    if (!sys || !input.module || !input.field || !input.type || workflowStatus(diagnostics) === "failed")
      return PrimitiveScript.#refuse(command, diagnostics);

    const moduleClassName = moduleComponentName(input.module);
    const inputClassName = `${moduleClassName}Input`;
    const paths = moduleSourcePaths(input.module);
    const constantPath = paths.constant;
    const dictionaryPath = paths.dictionary;
    const templatePath = paths.template;
    const changedFiles: PrimitiveChangedFile[] = [];
    const [hasConstant, hasDictionary] = await Promise.all([sys.exists(constantPath), sys.exists(dictionaryPath)]);
    if (!hasConstant) diagnostics.push(PrimitiveScript.#sourceMissing("Constant", constantPath));
    if (!hasDictionary) diagnostics.push(PrimitiveScript.#sourceMissing("Dictionary", dictionaryPath));
    if (workflowStatus(diagnostics) === "failed")
      return PrimitiveScript.#report(command, sys, changedFiles, diagnostics);

    let constantContent = await sys.readFile(constantPath);
    let dictionaryContent = await sys.readFile(dictionaryPath);
    const fieldBuilderName = viaBuilderParameterName(constantContent, inputClassName) ?? "field";
    if (hasConstantInputField(constantContent, inputClassName, input.field)) {
      diagnostics.push({
        severity: "error",
        code: "primitive-field-exists",
        input: "field",
        message: `Field "${input.field}" already exists in ${constantPath}.`,
      });
    }

    if (enumValues) {
      const enumClassName = `${moduleClassName}${capitalize(input.field)}`;
      const enumName = `${lowerlize(moduleClassName)}${capitalize(input.field)}`;
      constantContent = insertEnumClass(ensureEnumImport(constantContent), enumClassName, enumName, enumValues);
      dictionaryContent = ensureConstantTypeImport(dictionaryContent, `./${input.module}.constant`, enumClassName);
      input.type = enumClassName;
      const enumDictionary = insertDictionaryEnum(dictionaryContent, enumClassName, enumName, enumValues);
      if (!enumDictionary) {
        diagnostics.push({
          severity: "error",
          code: "primitive-dictionary-shape-unsupported",
          message: `Could not find a safe enum insertion point in ${dictionaryPath}.`,
        });
      } else {
        dictionaryContent = enumDictionary;
      }
    }
    if (!enumValues && normalizedType) {
      input.type = normalizedType;
      const defaultCoercion = coerceFieldDefault(input.type, input.defaultValue);
      if (defaultCoercion.diagnostic) diagnostics.push(defaultCoercion.diagnostic);
      constantContent = ensureBaseTypeImport(constantContent, input.type);
      if (input.type === "Date" && defaultCoercion.expression)
        constantContent = ensureBaseImport(constantContent, "dayjs");
    }
    if (enumValues) {
      const defaultCoercion = coerceFieldDefault("enum", input.defaultValue, { enumValues });
      if (defaultCoercion.diagnostic) diagnostics.push(defaultCoercion.diagnostic);
    }

    const nextConstantContent = insertIntoObject(
      constantContent,
      inputClassName,
      `${input.field}: ${fieldExpression(input.type, input.defaultValue, { enumValues, builderName: fieldBuilderName })},`,
    );
    const nextConstantContentWithLight =
      nextConstantContent && input.includeInLight
        ? insertLightProjectionField(nextConstantContent, moduleClassName, input.field)
        : nextConstantContent;
    const nextDictionaryContent = insertDictionaryModelField(dictionaryContent, moduleClassName, input.field);
    if (
      nextConstantContentWithLight &&
      (input.type === "Int" || input.type === "Float") &&
      new RegExp(`\\b${input.field}\\s*:\\s*field\\(${input.type}, \\{ default: "`, "m").test(
        nextConstantContentWithLight,
      )
    ) {
      diagnostics.push({
        severity: "error",
        code: "primitive-default-value-invalid",
        input: "default",
        failureScope: "source-change",
        message: `Generated ${input.type} default for "${input.field}" would be a string literal; refusing to write source.`,
      });
    }
    if (
      nextConstantContentWithLight &&
      (input.type === "Int" || input.type === "Float") &&
      !new RegExp(`import \\{[^}]*\\b${input.type}\\b[^}]*\\} from "akanjs/base";`).test(nextConstantContentWithLight)
    ) {
      diagnostics.push({
        severity: "error",
        code: "primitive-base-type-import-missing",
        failureScope: "source-change",
        message: `Generated source for ${input.field} requires ${input.type} import from "akanjs/base".`,
      });
    }
    if (!nextConstantContent) {
      diagnostics.push({
        severity: "error",
        code: "primitive-constant-shape-unsupported",
        message: `Could not find ${inputClassName} object shape in ${constantPath}.`,
      });
    }
    if (nextConstantContent && input.includeInLight && !nextConstantContentWithLight) {
      diagnostics.push({
        severity: "warning",
        code: "primitive-light-projection-shape-unsupported",
        failureScope: "source-change",
        message: `Could not find a safe Light${moduleClassName} projection insertion point in ${constantPath}.`,
      });
    }
    if (!nextDictionaryContent) {
      diagnostics.push({
        severity: "error",
        code: "primitive-dictionary-shape-unsupported",
        message: `Could not find ${moduleClassName} dictionary model shape in ${dictionaryPath}.`,
      });
    }
    if (
      nextConstantContentWithLight &&
      !hasConstantInputField(nextConstantContentWithLight, inputClassName, input.field)
    ) {
      diagnostics.push({
        severity: "error",
        code: "primitive-post-edit-constant-verify-failed",
        failureScope: "source-change",
        message: `Edited ${constantPath} did not contain "${input.field}" in ${inputClassName}.`,
      });
    }
    if (nextDictionaryContent && !hasDictionaryModelField(nextDictionaryContent, moduleClassName, input.field)) {
      diagnostics.push({
        severity: "error",
        code: "primitive-post-edit-dictionary-verify-failed",
        failureScope: "source-change",
        message: `Edited ${dictionaryPath} did not contain "${input.field}" in .model<${moduleClassName}>.`,
      });
    }

    let nextTemplateContent: string | null | undefined;
    if (input.surfaces?.includes("template")) {
      const policy = addFieldUiPolicyForType(enumValues ? "enum" : input.type);
      const hasTemplate = await sys.exists(templatePath);
      if (!hasTemplate) {
        diagnostics.push({
          severity: "warning",
          code: "primitive-template-missing",
          failureScope: "source-change",
          message: `Template source file was not found: ${templatePath}. Auto-edit skipped; add the field to the Template form manually if this module renders one.`,
        });
      } else if (!policy.autoTemplateSupported || policy.component === "Field.ToggleSelect") {
        diagnostics.push({
          severity: "warning",
          code: "primitive-template-component-manual",
          failureScope: "source-change",
          message: `Template auto insertion for ${policy.component} is not supported because option binding must be confirmed. Candidate position: inside Layout.Template near existing Field components in ${templatePath}.`,
        });
      } else {
        const templateContent = await sys.readFile(templatePath);
        nextTemplateContent = insertTemplateField({
          content: templateContent,
          moduleName: input.module,
          moduleClassName,
          fieldName: input.field,
          component: policy.component,
        });
        if (!nextTemplateContent) {
          diagnostics.push({
            severity: "warning",
            code: "primitive-template-shape-unsupported",
            failureScope: "source-change",
            message: `Could not find a safe Template insertion point in ${templatePath}. Expected generated ${input.module}Form hook and Layout.Template closing tag; candidate position is the existing field list before </Layout.Template>.`,
          });
        }
      }
    }

    if (workflowStatus(diagnostics) === "passed" && nextConstantContentWithLight && nextDictionaryContent) {
      await sys.writeFile(constantPath, nextConstantContentWithLight);
      await sys.writeFile(dictionaryPath, nextDictionaryContent);
      changedFiles.push(
        sourceFile(sys, constantPath, "modify", "Field source shape was updated."),
        sourceFile(sys, dictionaryPath, "modify", "Field dictionary labels were updated."),
      );
      if (nextTemplateContent !== undefined && nextTemplateContent !== null) {
        await sys.writeFile(templatePath, nextTemplateContent);
        changedFiles.push(sourceFile(sys, templatePath, "modify", "Template field surface was updated."));
      }
    }

    return PrimitiveScript.#report(command, sys, changedFiles, diagnostics);
  }

  async addMutation(workspace: Workspace, input: AddMutationInput) {
    const sys = await this.resolveSys(workspace, input.app);
    if (!sys || !input.module || !input.mutation)
      return PrimitiveScript.#refuse(
        "add-mutation",
        compactDiagnostics([
          !sys && PrimitiveScript.#targetMissing(),
          !input.module && PrimitiveScript.#inputMissing("module"),
          !input.mutation && PrimitiveScript.#inputMissing("mutation", "Mutation name is required."),
        ]),
      );
    const { diagnostics, files } = await MutationScaffold.build(sys, input);
    return await PrimitiveScript.#writeScaffold("add-mutation", sys, files, diagnostics);
  }

  async createInteraction(workspace: Workspace, input: CreateInteractionInput) {
    const sys = await this.resolveSys(workspace, input.app);
    if (!sys) return PrimitiveScript.#refuse("create-interaction", [PrimitiveScript.#targetMissing()]);
    const { diagnostics, files } = await InteractionScaffold.build(sys, input.interaction);
    return await PrimitiveScript.#writeScaffold("create-interaction", sys, files, diagnostics);
  }

  async addSlice(workspace: Workspace, input: AddSliceInput) {
    const moduleClassName = input.module ? moduleComponentName(input.module) : "";
    const serviceRef = lowerlize(moduleClassName);
    const name = input.slice;
    const queryName = name ? `query${capitalize(name)}` : null;
    return await this.#writeServiceSignalEntry(workspace, {
      command: "add-slice",
      app: input.app,
      module: input.module,
      entryKind: "slice",
      entryName: name,
      requiredInput: "slice",
      serviceMethod:
        name && queryName
          ? {
              name: queryName,
              block: [
                `  ${queryName}() {`,
                `    // TODO(service): return a QueryOf for the ${name} slice`,
                `    return {};`,
                `  }`,
              ].join("\n"),
            }
          : null,
      signal:
        name && queryName
          ? {
              className: `${moduleClassName}Slice`,
              entryLine: [
                `${name}: init({ guards: [None] })`,
                `    .exec(function () {`,
                `      return this.${serviceRef}Service.${queryName}();`,
                `    }),`,
              ].join("\n"),
              param: { mode: "positional", name: "init" },
            }
          : null,
    });
  }

  async renameKey(workspace: Workspace, input: RenameKeyInput) {
    const { diagnostics, files } = await KeyRename.build(workspace, input);
    const changedFiles: PrimitiveChangedFile[] = [];
    if (workflowStatus(diagnostics) === "passed")
      for (const file of files) {
        await workspace.writeFile(file.path, file.content, { silent: true });
        changedFiles.push({ path: file.path, action: file.action, reason: file.reason });
      }
    const targets = KeyRename.targetsOf(changedFiles);
    const names = targets.map((target) => target.slice(target.indexOf("/") + 1));
    return createPrimitiveWriteReport({
      command: "rename-key",
      changedFiles,
      generatedFiles: targets.flatMap((target) =>
        generatedFilePathsForTarget(target, "Generated files may change after sync."),
      ),
      validationCommands: names.flatMap(validationCommandsForTarget),
      diagnostics,
      nextActions: names.flatMap(nextActionsForTarget),
    });
  }

  async #writeServiceSignalEntry(
    workspace: Workspace,
    spec: {
      command: string;
      app: string | null;
      module: string | null;
      entryKind: "mutation" | "slice";
      entryName: string | null;
      requiredInput: string;
      serviceMethod: { name: string; block: string } | null;
      signal: { className: string; entryLine: string; param: FactoryParamPlan } | null;
    },
  ) {
    const sys = await this.resolveSys(workspace, spec.app);
    const diagnostics = compactDiagnostics([
      !sys && PrimitiveScript.#targetMissing(),
      !spec.module && PrimitiveScript.#inputMissing("module"),
      !spec.entryName &&
        PrimitiveScript.#inputMissing(spec.requiredInput, `${capitalize(spec.requiredInput)} name is required.`),
    ]);
    if (!sys || !spec.module || !spec.entryName || !spec.serviceMethod || !spec.signal)
      return PrimitiveScript.#refuse(spec.command, diagnostics);

    const { service: servicePath, signal: signalPath } = moduleSourcePaths(spec.module);
    const changedFiles: PrimitiveChangedFile[] = [];
    const [hasServiceFile, hasSignalFile] = await Promise.all([sys.exists(servicePath), sys.exists(signalPath)]);
    if (!hasServiceFile) diagnostics.push(PrimitiveScript.#sourceMissing("Service", servicePath));
    if (!hasSignalFile) diagnostics.push(PrimitiveScript.#sourceMissing("Signal", signalPath));
    if (workflowStatus(diagnostics) === "failed")
      return PrimitiveScript.#report(spec.command, sys, changedFiles, diagnostics);

    const serviceClassName = `${moduleComponentName(spec.module)}Service`;
    const serviceContent = await sys.readFile(servicePath);
    const signalContent = await sys.readFile(signalPath);
    const serviceMethodExists = hasClassMethod(serviceContent, serviceClassName, spec.serviceMethod.name);
    if (serviceMethodExists) {
      diagnostics.push({
        severity: "error",
        code: "primitive-service-method-exists",
        input: spec.requiredInput,
        message: `Method "${spec.serviceMethod.name}" already exists in ${serviceClassName}.`,
      });
    }
    if (hasSignalFactoryEntry(signalContent, spec.signal.className, spec.entryName)) {
      diagnostics.push({
        severity: "error",
        code: "primitive-signal-entry-exists",
        input: spec.requiredInput,
        message: `Entry "${spec.entryName}" already exists in ${spec.signal.className}.`,
      });
    }

    const nextServiceContent = serviceMethodExists
      ? serviceContent
      : insertClassMethod(serviceContent, serviceClassName, spec.serviceMethod.block);
    // `None` refuses every caller until the author names a guard; a guardless entry would serve unguarded over HTTP.
    const insertedSignalContent = insertSignalFactoryEntry(
      signalContent,
      spec.signal.className,
      spec.entryName,
      spec.signal.entryLine,
      spec.signal.param,
    );
    const nextSignalContent = insertedSignalContent
      ? ensureNamedImport(insertedSignalContent, "akanjs/signal", "None")
      : insertedSignalContent;
    if (!nextServiceContent) {
      diagnostics.push({
        severity: "error",
        code: "primitive-service-shape-unsupported",
        message: `Could not find ${serviceClassName} class body in ${servicePath}.`,
      });
    }
    if (!nextSignalContent) {
      diagnostics.push({
        severity: "error",
        code: "primitive-signal-shape-unsupported",
        message: `Could not find a safe insertion point in ${spec.signal.className} within ${signalPath}. Ensure the class exists and its factory returns an object literal.`,
      });
    }
    if (nextServiceContent && hasSourceParseErrors(nextServiceContent, "service.ts")) {
      diagnostics.push({
        severity: "error",
        code: "primitive-post-edit-service-parse-failed",
        failureScope: "source-change",
        message: `Edited ${servicePath} did not parse cleanly; refusing to write source.`,
      });
    }
    if (nextSignalContent && hasSourceParseErrors(nextSignalContent, "signal.ts")) {
      diagnostics.push({
        severity: "error",
        code: "primitive-post-edit-signal-parse-failed",
        failureScope: "source-change",
        message: `Edited ${signalPath} did not parse cleanly; refusing to write source.`,
      });
    }
    if (nextSignalContent && !hasSignalFactoryEntry(nextSignalContent, spec.signal.className, spec.entryName)) {
      diagnostics.push({
        severity: "error",
        code: "primitive-post-edit-signal-verify-failed",
        failureScope: "source-change",
        message: `Edited ${signalPath} did not contain entry "${spec.entryName}" in ${spec.signal.className}.`,
      });
    }

    if (workflowStatus(diagnostics) === "passed" && nextServiceContent && nextSignalContent) {
      await sys.writeFile(servicePath, nextServiceContent);
      await sys.writeFile(signalPath, nextSignalContent);
      changedFiles.push(
        sourceFile(sys, servicePath, "modify", `Service ${spec.entryKind} was added.`),
        sourceFile(sys, signalPath, "modify", `Signal ${spec.entryKind} was added.`),
      );
    }

    return PrimitiveScript.#report(spec.command, sys, changedFiles, diagnostics);
  }

  static async #writeScaffold(command: string, sys: Sys, files: ScaffoldFile[], diagnostics: WorkflowDiagnostic[]) {
    const changedFiles: PrimitiveChangedFile[] = [];
    if (workflowStatus(diagnostics) === "passed") {
      for (const file of files) {
        //? Silent: the report lists every file, and `-o json` must print nothing but the report.
        await sys.writeFile(file.path, file.content, { silent: true });
        changedFiles.push(sourceFile(sys, file.path, file.action, file.reason));
      }
    }
    return PrimitiveScript.#report(command, sys, changedFiles, diagnostics);
  }

  static #refuse(command: string, diagnostics: WorkflowDiagnostic[]) {
    return createPrimitiveWriteReport({
      command,
      changedFiles: [],
      generatedFiles: [],
      validationCommands: [],
      diagnostics,
      nextActions: [],
    });
  }

  static #report(command: string, sys: Sys, changedFiles: PrimitiveChangedFile[], diagnostics: WorkflowDiagnostic[]) {
    return createPrimitiveWriteReport({
      command,
      changedFiles,
      generatedFiles: generatedFilesForSync(sys),
      validationCommands: validationCommandsForTarget(sys.name),
      diagnostics,
      nextActions: nextActionsForTarget(sys.name),
    });
  }

  static #targetMissing(): WorkflowDiagnostic {
    return { severity: "error", code: "primitive-target-missing", message: "Target app or library was not found." };
  }

  static #inputMissing(input: string, message = `${capitalize(input)} is required.`): WorkflowDiagnostic {
    return { severity: "error", code: "primitive-input-missing", message, input };
  }

  static #sourceMissing(kind: string, path: string): WorkflowDiagnostic {
    return {
      severity: "error",
      code: "primitive-source-missing",
      message: `${kind} source file was not found: ${path}.`,
    };
  }
}
