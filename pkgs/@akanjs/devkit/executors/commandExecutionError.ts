//? A backslash is a path separator on Windows but an escape in a POSIX shell, so only there does it force quoting.
const plainCommandArgPattern = process.platform === "win32" ? /^[\w@%+=:,./\\-]+$/ : /^[\w@%+=:,./-]+$/;
const formatCommandArg = (value: string) => (plainCommandArgPattern.test(value) ? value : JSON.stringify(value));

const formatCommandForDisplay = (command: string, args: string[] = []) =>
  [command, ...args].map(formatCommandArg).join(" ");

export interface CommandExecutionErrorOptions {
  command: string;
  args?: string[];
  cwd: string;
  code: number | null;
  signal: string | null;
  stdout?: string;
  stderr?: string;
  cause?: unknown;
}

export class CommandExecutionError extends Error {
  command: string;
  args: string[];
  cwd: string;
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;

  constructor({
    command,
    args = [],
    cwd,
    code,
    signal,
    stdout = "",
    stderr = "",
    cause,
  }: CommandExecutionErrorOptions) {
    const displayCommand = formatCommandForDisplay(command, args);
    const status = signal ? `signal: ${signal}` : `exit code: ${code ?? "unknown"}`;
    const output = (stderr || stdout).trim();
    super([`Command failed: ${displayCommand}`, `cwd: ${cwd}`, status, output ? `\n${output}` : ""].join("\n"), {
      cause,
    });
    this.name = "CommandExecutionError";
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.code = code;
    this.signal = signal;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
