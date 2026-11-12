import type { BuildPhase } from "akanjs/server";
import { BuilderChannel } from "./builderChannel";

export const sendBuildStatus = (
  phase: BuildPhase,
  {
    generation,
    ok,
    files,
    message,
    scope,
  }: { generation?: number; ok: boolean; files?: string[]; message?: string; scope?: string },
): void => {
  if (typeof generation !== "number") return;
  BuilderChannel.emit({
    type: "build-status",
    data: { generation, phase, ok, files: files ?? [], message, ...(scope !== undefined ? { scope } : {}) },
  });
};

//? A save the user broke fails the same way in a worker, so it is reported here and the patcher keeps its state: the
//? modules it could not compile stay pending in the graph and the fixing save compiles them.
export const isCompileError = (error: unknown): boolean => error instanceof AggregateError;
