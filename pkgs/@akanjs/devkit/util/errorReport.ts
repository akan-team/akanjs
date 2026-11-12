import { realpathSync } from "node:fs";
import path from "node:path";

export class ErrorReport {
  static readonly shownNestedErrors = 20;

  static format(error: unknown, workspaceRoot = process.cwd()): string {
    if (error instanceof AggregateError) {
      const shown = error.errors.slice(0, ErrorReport.shownNestedErrors);
      const hidden = error.errors.length - shown.length;
      const nestedMessages = [
        ...shown.map(
          (nestedError, index) => ErrorReport.format(nestedError, workspaceRoot).trim() || `Unknown error ${index + 1}`,
        ),
        ...(hidden > 0 ? [`…and ${hidden} more`] : []),
      ]
        .map((message) => message.replace(/^/gm, "  "))
        .join("\n");
      const message = nestedMessages ? `${error.message}\n${nestedMessages}` : error.message;
      return `${message}${ErrorReport.#causeOf(error, workspaceRoot)}`;
    }
    if (error instanceof Error)
      return `${ErrorReport.#withLocation(error.message, error, workspaceRoot)}${ErrorReport.#causeOf(error, workspaceRoot)}`;
    if (typeof error === "object" && error !== null && "message" in error)
      return ErrorReport.#withLocation(String(error.message), error, workspaceRoot);
    return String(error);
  }

  static #causeOf(error: Error, workspaceRoot: string): string {
    return error.cause ? `\nCaused by: ${ErrorReport.format(error.cause, workspaceRoot)}` : "";
  }

  static #withLocation(message: string, error: object, workspaceRoot: string): string {
    const { position } = error as { position?: { file: string; line: number; column: number } | null };
    if (!position?.file) return message;
    const file = ErrorReport.#relativeToWorkspace(position.file, workspaceRoot);
    const location = position.line > 0 ? `${file}:${position.line}:${position.column}` : file;
    return message.includes(location) ? message : message.replace(/^.*/, (headline) => `${headline} (${location})`);
  }

  // Bun names the file by its realpath, so a workspace root reached through a symlink is matched by its own too.
  static #relativeToWorkspace(file: string, workspaceRoot: string): string {
    if (!path.isAbsolute(file)) return file;
    for (const root of [workspaceRoot, ErrorReport.#realpathOf(workspaceRoot)]) {
      const relative = path.relative(root, file);
      if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
        return relative.replaceAll(path.sep, "/");
    }
    return file;
  }

  static #realpathOf(dir: string): string {
    try {
      return realpathSync(dir);
    } catch {
      return dir;
    }
  }
}
