import path from "node:path";

/**
 * Where a replica keeps its child sockets and rotating logs. Both the gateway and a solo server resolve it,
 * and they must land on the same directory: switching between the two modes must not move the log file.
 */
export const resolveRuntimeDir = (runtimeDir?: string): string =>
  path.resolve(
    runtimeDir ??
      process.env.AKAN_RUNTIME_DIR ??
      (process.env.NODE_ENV === "production"
        ? path.resolve(process.cwd(), "runtime")
        : path.resolve(process.cwd(), "local", "apps", process.env.AKAN_PUBLIC_APP_NAME ?? "unknown", "runtime")),
  );
