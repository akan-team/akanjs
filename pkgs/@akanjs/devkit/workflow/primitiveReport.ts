import type { Sys } from "../commandDecorators";
import { generatedFilePathsForTarget } from "./artifacts";
import { getSysRoot } from "./modulePaths";
import type {
  PrimitiveChangedFile,
  PrimitiveFileMap,
  PrimitiveGeneratedFile,
  PrimitiveNextAction,
  PrimitiveValidationCommand,
  PrimitiveWriteReport,
} from "./types";

export const sourceFile = (sys: Sys, path: string, action: PrimitiveChangedFile["action"], reason: string) => ({
  path: `${getSysRoot(sys)}/${path}`,
  action,
  reason,
});

export const generatedFilesForSync = (sys: Sys, reason = "Generated files may change after sync.") =>
  generatedFilePathsForTarget(getSysRoot(sys), reason);

export const validationCommandsForTarget = (target: string) =>
  [
    { command: `akan verify ${target}`, reason: "Sync, lint, typecheck and build the target in one run." },
  ] satisfies PrimitiveValidationCommand[];

export const nextActionsForTarget = (target: string) =>
  [
    { command: `akan verify ${target}`, reason: "Refresh generated files and validate the target in one run." },
  ] satisfies PrimitiveNextAction[];

export const createPrimitiveWriteReport = ({
  command,
  status,
  changedFiles = [],
  generatedFiles = [],
  validationCommands = [],
  diagnostics = [],
  nextActions = [],
}: Omit<PrimitiveWriteReport, "schemaVersion" | "status"> & {
  status?: PrimitiveWriteReport["status"];
}): PrimitiveWriteReport => ({
  schemaVersion: 1,
  command,
  status: status ?? (diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "failed" : "passed"),
  changedFiles,
  generatedFiles,
  validationCommands,
  diagnostics,
  nextActions,
});

export const createPassedPrimitiveReport = ({
  command,
  changedFiles,
  generatedFiles,
  target,
  nextActions,
}: {
  command: string;
  changedFiles: PrimitiveChangedFile[];
  generatedFiles?: PrimitiveGeneratedFile[];
  target: string;
  nextActions?: PrimitiveNextAction[];
}) =>
  createPrimitiveWriteReport({
    command,
    changedFiles,
    generatedFiles: generatedFiles ?? [],
    validationCommands: validationCommandsForTarget(target),
    diagnostics: [],
    nextActions: nextActions ?? nextActionsForTarget(target),
  });

export const scalarChangedFiles = (sys: Sys, scalarName: string, files: PrimitiveFileMap) =>
  Object.values(files).map((file) =>
    sourceFile(sys, `lib/__scalar/${scalarName}/${file.filename}`, "create", "Scalar source file was created."),
  );
