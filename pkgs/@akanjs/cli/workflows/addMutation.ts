import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { baseValidation, inspectModuleStep, moduleInput, syncGeneratedStep, sysInputs, validateTarget } from "./shared";

export const addMutationWorkflowSpec: WorkflowSpec = {
  schemaVersion: 1,
  name: "add-mutation",
  description:
    "Write one state-changing act end to end: document chain method, service method, guarded signal mutation, store action, dictionary entry, and a signal test placeholder.",
  whenToUse:
    "Use when the user asks for a new state-changing module action, or when a store action or component chains two or more writes: bundle them into this one mutation with `with` and `after`.",
  inputs: {
    ...sysInputs,
    ...moduleInput,
    mutation: {
      type: "string",
      required: true,
      description: "Mutation name with the model re-added (archiveTask); the document chain method drops it (archive).",
    },
    guard: {
      type: "string-list",
      required: true,
      description:
        "Guard class names the endpoint names (Admin, or Every,Person). No default: each must be exported by the target's srvkit, a lib it reaches, or akanjs/signal; None is refused.",
    },
    with: {
      type: "string-list",
      description:
        "<serviceRef>.<method> writes that must commit with the mutation (courtPc.pushPcCommand); the service method runs them inside this.transaction().",
    },
    after: {
      type: "string-list",
      description:
        "<serviceRef>.<method> side effects that run once the commit lands (noti.sendArchived); each goes through this.afterCommit().",
    },
  },
  optionalSurfaces: {
    document: "include",
    service: "include",
    signal: "include",
    store: "include",
    dictionary: "include",
    test: "include",
    util: "infer",
  },
  steps: [
    inspectModuleStep("Read the document, service, signal, store, and dictionary the mutation spans."),
    {
      id: "update-document",
      title: "Update document",
      tool: "updateDocumentChain",
      description: "Add the chain method (validate → mutate → return this, never save()) under a transition comment.",
    },
    {
      id: "update-service",
      title: "Update service",
      tool: "updateServiceMutation",
      description:
        "Add the bare verb (archive for archiveMemo): load → chain → return await save(); with `with`/`after`, wrap it in this.transaction() and queue side effects in this.afterCommit(). Under a guard that only checks sign-in, a TODO marks where the acting user's right to the record is checked.",
    },
    {
      id: "update-signal",
      title: "Update signal",
      tool: "updateSignalMutation",
      description:
        "Add the mutation to the Endpoint with the chosen guards and a one-line exec; the acting user comes through .with() only when the guard guarantees one.",
    },
    {
      id: "update-store",
      title: "Update store",
      tool: "updateStoreAction",
      description: "Add the store action: one call to the endpoint, then set<Model> with the result.",
    },
    {
      id: "update-dictionary",
      title: "Update dictionary",
      tool: "updateDictionaryEndpoint",
      description: "Add the .endpoint() entry with a [en, ko] label, a .desc(), and every .arg() named.",
    },
    {
      id: "add-signal-test",
      title: "Add signal test",
      tool: "addSignalTest",
      description:
        "Add it.todo placeholders for the mutation to <module>.signal.test.ts, creating the file if missing.",
    },
    {
      id: "connect-action-ui",
      title: "Connect action UI",
      tool: "connectActionUi",
      description: "Review where a Util control calls the new store action.",
    },
    syncGeneratedStep("Refresh generated service, signal, and store barrels."),
    validateTarget,
  ],
  predictedChanges: [
    {
      target: "*/lib/<module>/<module>.document.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Document chain method is added.",
    },
    {
      target: "*/lib/<module>/<module>.service.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Service mutation method is added, with injected services for `with`/`after`.",
    },
    {
      target: "*/lib/<module>/<module>.signal.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Guarded signal mutation is added.",
    },
    {
      target: "*/lib/<module>/<module>.store.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Store action calling the mutation is added.",
    },
    {
      target: "*/lib/<module>/<module>.dictionary.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Dictionary endpoint entry is added.",
    },
    {
      target: "*/lib/<module>/<module>.signal.test.ts",
      action: "modify",
      applyScope: "auto",
      reason: "Signal test placeholders are added (the file is created when missing).",
    },
    {
      target: "*/lib/<module>/<Module>.Util.tsx",
      action: "modify",
      applyScope: "manual-review",
      reason: "A control may call the new store action.",
    },
    { target: "*/lib/srv.ts", action: "sync", reason: "Generated service barrel may change after sync." },
    { target: "*/lib/sig.ts", action: "sync", reason: "Generated signal barrel may change after sync." },
  ],
  validation: [
    ...baseValidation,
    {
      command: "akan typecheck <app-name>",
      reason: "Validate the mutation across document, service, signal, and store.",
      kind: "typecheck",
    },
  ],
  completionCriteria: [
    "The chain method validates and mutates, and its transition comment names the real states.",
    "Every write that must land together runs in the one service method; no store action sends a second mutation.",
    "The endpoint names guards that admit exactly the intended caller.",
    "The signal test placeholders are replaced by real cases.",
    "Generated files are refreshed and validation passes.",
  ],
  replacesRules: [
    "akan.store.multi-write",
    "akan.component.write-chain",
    "akan.store.root-write-chain",
    "akan.write.placement",
  ],
};
