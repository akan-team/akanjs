// Programs a desktop plugin runs that the app does not carry: the user's own PATH, a command's file on it, and a child
// that ends with the app (DesktopContext userPath, resolveCommand, spawn).
//
// - An app started from the Finder or a Linux launcher has the session's PATH (macOS: /usr/bin:/bin:/usr/sbin:/sbin),
//   not the one the user's shell profile builds. userPath() asks the user's login shell for it once and keeps the
//   answer: the shell runs `/bin/sh -c 'printf …'`, one external command every shell's syntax can spell, which prints
//   the PATH it was handed between two marks, so whatever a profile prints is left out. First as an interactive login
//   shell (a .zshrc or .bashrc is where version managers and `bun` put themselves), then as a login shell only, since
//   a profile that replaces the shell (`exec fish`) never reaches the command. Windows keeps the PATH the app started
//   with: Explorer hands every app the user's whole one.
// - macOS and Linux end a child with the app however the app ends: the child leads its own process group, and one
//   helper (`/bin/sh`, in a session of its own, started with the first child) reads the groups from a pipe this
//   process holds. The pipe closes when the process is gone, whatever ended it, and the helper ends the groups:
//   SIGTERM, then SIGKILL after REAP_GRACE. What a child started and left in its group ends when the child exits, as
//   the carried server's does (server.ts); a program that must outlive it starts a session of its own.
// - Windows: Bun puts every child in the app's job object, which ends them with the app (relaunch.ts). A `.cmd` or
//   `.bat` file (an npm-installed tool is one) is run by cmd.exe, each argument quoted for both cmd.exe and the
//   program's own parser; kill() ends the tree, since ending cmd.exe alone would leave the tool running.

import { randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, delimiter, isAbsolute, join, resolve as resolvePath } from "node:path";
import { AkanNativeError } from "../../core/src/index.ts";
import type { DocumentScope } from "./plugin.ts";
import { envValue, pathWithFirst, pipeLines } from "./server.ts";

export interface ResolvedCommand {
  path: string;
  /** Windows: a `.cmd` or `.bat` file, which only cmd.exe runs. ctx.spawn does that itself. */
  shell: boolean;
}

export interface DesktopSpawnOptions {
  cwd?: string;
  /**
   * The child's whole environment, nothing added. Default: the app's own, with the app's bin folder and then the
   * user's PATH (userPath) as its PATH.
   */
  env?: Record<string, string | undefined>;
  /** "pipe": `stdin` writes to the child. Default "ignore". */
  stdin?: "pipe" | "ignore";
  /** Reads the child's output line by line; `stdout` and `stderr` are null then. */
  onLine?(line: string, stream: "stdout" | "stderr"): void;
  /** `ctx.document`: the child also ends when that page does (a reload, a navigation, its window closed). */
  document?: DocumentScope;
}

export interface DesktopProcessInput {
  write(chunk: string | Uint8Array): void;
  end(): void;
}

export interface DesktopProcess {
  readonly pid: number;
  /** The exit code; 128 + the signal's number when a signal ended it. */
  readonly exited: Promise<number>;
  readonly stdin: DesktopProcessInput | null;
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
  /** Signals the child and what it started (macOS, Linux: its process group; Windows: its tree, ended outright). */
  kill(signal?: NodeJS.Signals): void;
}

export interface DesktopCommands {
  userPath(): Promise<string>;
  resolveCommand(name: string): Promise<ResolvedCommand | null>;
  spawn(cmd: string[], options?: DesktopSpawnOptions): Promise<DesktopProcess>;
}

export interface CommandsOptions {
  /** The app's own executables (desktop.bin), searched first. */
  binDir: string | null;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  /** The user's shell; the account's by default. */
  shell?: string;
  probeTimeout?: number;
  reapGrace?: number;
}

/** A login shell with a heavy profile takes seconds (5 s measured for bash with nvm and conda). */
export const PROBE_TIMEOUT = 10_000;
/** What a child gets between SIGTERM and SIGKILL when its page or the app ends. */
export const REAP_GRACE = 2000;

/** The app's bin folder first on this process's PATH, under one name; null when the app carries none. */
export function appBinFirst(resources: string): string | null {
  const binDir = join(resources, "bin");
  if (!existsSync(binDir)) return null;
  //? A Worker keeps its own copy of process.env, and Bun.spawn without `env` ignores it anyway: the server launcher
  //? and plugins that pass process.env get the app's executables first. One name for it from here on: a second PATH
  //? beside Windows' `Path` would hide the system's from a child.
  const path = envValue(process.env, "PATH");
  for (const name of Object.keys(process.env)) if (name.toUpperCase() === "PATH") delete process.env[name];
  process.env.PATH = pathWithFirst(binDir, path);
  return binDir;
}

const isFile = (path: string, executable: boolean): boolean => {
  try {
    if (!statSync(path).isFile()) return false;
    if (executable) accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * `name` in `dirs`, the first hit. Windows tries each PATHEXT ending unless the name already has one of them. A name
 * with a folder in it is looked up as that path alone.
 */
export function findCommand(
  name: string,
  dirs: readonly string[],
  { platform = process.platform, pathExt }: { platform?: NodeJS.Platform; pathExt?: string } = {},
): ResolvedCommand | null {
  if (!name || name.includes("\0")) return null;
  const windows = platform === "win32";
  const endings = windows
    ? (pathExt || ".COM;.EXE;.BAT;.CMD")
        .split(";")
        .map((ending) => ending.trim().toLowerCase())
        .filter((ending) => ending.startsWith("."))
    : [];
  const named = endings.some((ending) => name.toLowerCase().endsWith(ending));
  const candidates = windows ? (named ? [name] : endings.map((ending) => `${name}${ending}`)) : [name];
  const within = /[\\/]/.test(name) ? [""] : dirs.filter((dir) => dir && (windows || isAbsolute(dir)));
  for (const dir of within)
    for (const candidate of candidates) {
      const path = dir ? join(dir, candidate) : resolvePath(candidate);
      if (isFile(path, !windows)) return { path, shell: windows && /\.(cmd|bat)$/i.test(path) };
    }
  return null;
}

/**
 * A command line cmd.exe hands to a batch file unchanged: each argument quoted as CommandLineToArgvW reads it, then
 * every character cmd.exe gives a meaning escaped with `^`, twice for the arguments, which the batch file's own line
 * (`node "%~dp0\…" %*`) puts through cmd.exe again.
 */
export function batchCommandLine(file: string, args: readonly string[]): string {
  //? cmd.exe ends a command at a line break, whatever quotes it: the rest would be a command of its own.
  if (args.some((arg) => /[\r\n\0]/.test(arg)))
    throw new AkanNativeError("INVALID_ARGS", "an argument of a .cmd or .bat file cannot hold a line break");
  const meta = /([()\][%!^"`<>&|;, *?])/g;
  const quoted = (arg: string) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  const line = [file.replace(meta, "^$1"), ...args.map((arg) => quoted(arg).replace(meta, "^$1").replace(meta, "^$1"))];
  return `"${line.join(" ")}"`;
}

const REAPER = `groups=""
while IFS=" " read -r op id; do
  case "$op" in
    add) groups="$groups $id" ;;
    del) kept=""; for g in $groups; do [ "$g" = "$id" ] || kept="$kept $g"; done; groups=$kept ;;
  esac
done
[ -n "$groups" ] || exit 0
for g in $groups; do kill -TERM "-$g" 2>/dev/null; done
sleep "$AKAN_NATIVE_REAP_GRACE"
for g in $groups; do kill -KILL "-$g" 2>/dev/null; done
exit 0`;

const endGroup = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: nothing is left in the group.
  }
};

/** The process groups the helper ends once this process is gone; the helper starts with the first of them. */
function createReaper(grace: number) {
  let helper: { proc: Bun.Subprocess<"pipe", "ignore", "ignore">; alive: boolean } | undefined;
  const groups = new Set<number>();
  const tell = (line: string) => {
    if (!helper?.alive) {
      const proc = Bun.spawn(["/bin/sh", "-c", REAPER], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
        env: { PATH: "/usr/bin:/bin", AKAN_NATIVE_REAP_GRACE: String(grace / 1000) },
        //? A session of its own: a signal sent to the app's process group must not end the helper before the app.
        detached: true,
      });
      proc.unref();
      const started = { proc, alive: true };
      void proc.exited.then(() => {
        started.alive = false;
      });
      helper = started;
      for (const group of groups) proc.stdin.write(`add ${group}\n`);
    }
    helper.proc.stdin.write(line);
    helper.proc.stdin.flush();
  };
  return {
    add(group: number) {
      groups.add(group);
      tell(`add ${group}\n`);
    },
    drop(group: number) {
      if (groups.delete(group)) tell(`del ${group}\n`);
    },
  };
}

/** The PATH `shell` has once it read its files as `flags` make it, or null when it did not say within `timeout`. */
async function askShell(
  shell: string,
  flags: string[],
  env: Record<string, string | undefined>,
  timeout: number,
): Promise<string | null> {
  const mark = `__akan_native_${randomBytes(8).toString("hex")}__`;
  try {
    const proc = Bun.spawn([shell, ...flags, `/bin/sh -c 'printf "${mark}%s${mark}" "$PATH"'`], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      env,
      //? Its own process group: what a profile started in the background ends with the shell that ran it.
      detached: true,
    });
    //? Read to the second mark, not to the end: a daemon a profile started keeps the pipe open after the shell left.
    const reader = proc.stdout.getReader();
    const stop = () => void reader.cancel().catch(() => {});
    const late = setTimeout(stop, timeout);
    const decoder = new TextDecoder();
    let out = "";
    try {
      while (out.split(mark).length < 3) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
      }
    } finally {
      clearTimeout(late);
      stop();
      endGroup(proc.pid, "SIGKILL");
    }
    const path = out.split(mark)[1];
    return out.split(mark).length >= 3 && path?.includes("/") ? path : null;
  } catch {
    return null;
  }
}

/** The user's shell's PATH: as an interactive login shell first, then as a login shell only; null when neither told. */
export async function loginShellPath(
  env: Record<string, string | undefined>,
  { shell, timeout = PROBE_TIMEOUT }: { shell?: string; timeout?: number } = {},
): Promise<string | null> {
  let asked = shell;
  try {
    asked ||= userInfo().shell || undefined;
  } catch {
    // No account entry for this uid (a container): the environment's shell, or sh.
  }
  asked ||= env.SHELL || "/bin/sh";
  //? tcsh takes -l only as its one flag, and reads its login files for no other.
  const attempts = /^t?csh$/.test(basename(asked))
    ? [["-ic"], ["-c"]]
    : [
        ["-l", "-i", "-c"],
        ["-l", "-c"],
      ];
  for (const flags of attempts) {
    const path = await askShell(asked, flags, env, timeout);
    if (path) return path;
  }
  console.warn(
    `[akan-native] ${asked} did not tell its PATH; commands are looked up on the app's own and in the usual folders`,
  );
  return null;
}

/**
 * Where a user's own tools usually are, for a shell that did not tell its PATH (a profile slower than the timeout on a
 * loaded machine): after the app's own PATH, and only the folders that exist. Homebrew, the per-user bin folders and
 * the shims of the version managers that put one folder on PATH.
 */
export function usualToolDirs(home: string | undefined): string[] {
  const own = [".local/bin", ".bun/bin", ".cargo/bin", ".volta/bin", ".asdf/shims", ".local/share/mise/shims"];
  return [...(home ? own.map((dir) => join(home, dir)) : []), "/opt/homebrew/bin", "/usr/local/bin"].filter((dir) =>
    existsSync(dir),
  );
}

export function createCommands(options: CommandsOptions): DesktopCommands {
  const platform = options.platform ?? process.platform;
  const windows = platform === "win32";
  const env = options.env ?? process.env;
  const { binDir } = options;
  const grace = options.reapGrace ?? REAP_GRACE;
  const separator = windows ? ";" : delimiter;
  const isBin = (dir: string) => (windows ? dir.toLowerCase() === binDir?.toLowerCase() : dir === binDir);
  const withoutBin = (path: string) =>
    path
      .split(separator)
      .filter((dir) => dir && !isBin(dir))
      .join(separator);
  const inherited = withoutBin(envValue(env, "PATH", platform) ?? "");
  const readUserPath = async () => {
    if (windows) return inherited;
    const told = await loginShellPath(
      { ...env, PATH: inherited },
      { shell: options.shell, timeout: options.probeTimeout },
    );
    if (told !== null) return withoutBin(told);
    const known = inherited.split(separator);
    return [...known, ...usualToolDirs(env.HOME).filter((dir) => !known.includes(dir))].filter(Boolean).join(separator);
  };
  let user: Promise<string> | undefined;
  const userPath = () => (user ??= readUserPath());
  const resolveIn = (name: string, path: string) =>
    findCommand(name, [...(binDir ? [binDir] : []), ...path.split(separator)], {
      platform,
      pathExt: envValue(env, "PATHEXT", platform),
    });
  const reaper = windows ? null : createReaper(grace);

  const spawn = async (cmd: string[], spawnOptions: DesktopSpawnOptions = {}): Promise<DesktopProcess> => {
    const [name, ...args] = cmd;
    if (typeof name !== "string" || !name) throw new AkanNativeError("INVALID_ARGS", "spawn needs a command to run");
    const childEnv = spawnOptions.env ?? {
      ...Object.fromEntries(Object.entries(env).filter(([key]) => key.toUpperCase() !== "PATH")),
      PATH: [binDir, await userPath()].filter(Boolean).join(separator),
    };
    const found = resolveIn(name, envValue(childEnv, "PATH", platform) ?? "");
    if (!found)
      throw new AkanNativeError(
        "NOT_FOUND",
        `${name} is not in the app's bin folder nor on the PATH it would run with`,
      );
    const proc = Bun.spawn(
      found.shell
        ? [envValue(env, "ComSpec", platform) || "cmd.exe", "/d", "/s", "/c", batchCommandLine(found.path, args)]
        : [found.path, ...args],
      {
        cwd: spawnOptions.cwd,
        env: childEnv,
        stdin: spawnOptions.stdin ?? "ignore",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
        windowsVerbatimArguments: found.shell,
        //? Never on Windows, where it would take the child out of the job object that ends it with the app.
        detached: !windows,
      },
    );
    const { pid } = proc;
    const kill = (signal: NodeJS.Signals = "SIGTERM") => {
      if (!windows) return endGroup(pid, signal);
      try {
        const taskkill = join(envValue(env, "SystemRoot", platform) ?? "C:\\Windows", "System32", "taskkill.exe");
        Bun.spawn([taskkill, "/pid", String(pid), "/t", "/f"], { stdio: ["ignore", "ignore", "ignore"] });
      } catch {
        proc.kill();
      }
    };
    let late: ReturnType<typeof setTimeout> | undefined;
    const forget = spawnOptions.document?.own(() => {
      kill("SIGTERM");
      late = setTimeout(() => kill("SIGKILL"), grace);
    });
    reaper?.add(pid);
    void proc.exited.then(() => {
      clearTimeout(late);
      forget?.();
      if (!reaper) return;
      endGroup(pid, "SIGKILL");
      reaper.drop(pid);
    });
    const { onLine } = spawnOptions;
    if (onLine) {
      const failed = (error: unknown) => console.error(`[akan-native] reading ${name}'s output failed`, error);
      pipeLines(proc.stdout, (line) => onLine(line, "stdout")).catch(failed);
      pipeLines(proc.stderr, (line) => onLine(line, "stderr")).catch(failed);
    }
    const sink = typeof proc.stdin === "object" ? proc.stdin : null;
    return {
      pid,
      exited: proc.exited,
      stdin: sink && {
        write(chunk) {
          sink.write(chunk);
          sink.flush();
        },
        end: () => void sink.end(),
      },
      stdout: onLine ? null : proc.stdout,
      stderr: onLine ? null : proc.stderr,
      kill,
    };
  };

  return { userPath, resolveCommand: async (name) => resolveIn(name, await userPath()), spawn };
}
