import type { TypecheckRecord } from "../typeChecker";

export class TypecheckFailure extends Error {
  constructor(readonly records: TypecheckRecord[]) {
    super(
      records
        .slice(0, 20)
        .map((record) => `${record.file ?? "-"}:${record.line}:${record.col} ${record.code} ${record.message}`)
        .join("\n") || "Typecheck failed",
    );
    this.name = "TypecheckFailure";
  }
}
