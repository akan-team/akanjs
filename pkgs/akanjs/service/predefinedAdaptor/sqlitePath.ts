import path from "node:path";

interface ResolveDefaultSqliteFileOptions {
  appName: string;
  fileName: string;
  isProduction: boolean;
  operationMode?: string;
  workspaceRoot?: string;
}

export const resolveDefaultSqliteFile = ({
  appName,
  fileName,
  isProduction,
  operationMode,
  workspaceRoot,
}: ResolveDefaultSqliteFileOptions) => {
  const sqliteDir = process.env.AKAN_SQLITE_DIR;
  if (sqliteDir) return path.join(sqliteDir, fileName);
  const isLocalOperation = (operationMode ?? process.env.AKAN_PUBLIC_OPERATION_MODE) === "local";
  if (isProduction && !isLocalOperation) return path.join(process.cwd(), "sqlite", fileName);
  return path.join(workspaceRoot ?? process.cwd(), "local", "apps", appName, fileName);
};
