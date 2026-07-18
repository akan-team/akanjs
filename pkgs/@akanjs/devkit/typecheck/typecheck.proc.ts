import { Logger } from "akanjs/common";
import { TypeChecker } from "../typeChecker";

try {
  const filePath = process.env.AKAN_TYPECHECK_FILE;
  if (filePath) {
    const cwdPath = process.env.AKAN_TYPECHECK_CWD;
    if (!cwdPath) throw new Error("AKAN_TYPECHECK_CWD is required");

    const typeChecker = new TypeChecker({ cwdPath } as never);
    const { fileDiagnostics, fileErrors, fileWarnings } = typeChecker.check(filePath);
    const message = typeChecker.formatDiagnostics(fileDiagnostics);
    Logger.rawLog(
      JSON.stringify({
        fileDiagnosticsCount: fileDiagnostics.length,
        fileErrorsCount: fileErrors.length,
        fileWarningsCount: fileWarnings.length,
        message,
      }),
    );
    process.exit(0);
  }

  const configPath = process.env.AKAN_TYPECHECK_TSCONFIG;
  if (!configPath) throw new Error("AKAN_TYPECHECK_TSCONFIG is required");
  const result = TypeChecker.checkProject(configPath);
  if (result.errors.length > 0) {
    console.error(result.message);
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
