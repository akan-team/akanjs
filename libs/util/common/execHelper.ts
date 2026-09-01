// Shared shell/exec helpers, consolidated from the executor + k8s modules where they
// were byte-identical (or trivially-equivalent) duplicates. Centralizing avoids
// akan.global.duplicate-exported-function-name across the per-file helpers.

export type CommandInput = string | string[];

// Named `execShellQuote` (NOT `shellQuote`) because projectBuildPipeline/command.ts already
// exports a top-level `shellQuote`; a second same-named export trips duplicate-exported-function-name.
export const execShellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
export const normalizeRemotePath = (path: string) => path.replace(/^~(?=\/|$)/, "$HOME");
export const doubleQuoteExpandable = (value: string) => `"${value.replace(/(["\\])/g, "\\$1").replaceAll("`", "\\`")}"`;
export const joinCommands = (command: CommandInput) => (Array.isArray(command) ? command.join(" && ") : command);
export const remoteDirname = (path: string) => path.replace(/\/[^/]+$/, "") || ".";
export const enc = (segment: string) => encodeURIComponent(segment);
