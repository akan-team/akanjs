// ctx.userPath, resolveCommand and spawn (commands.ts) against scripted shells and programs in a temporary folder.
// The children are real processes: what must end is checked by its PID.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isAkanNativeError } from "../../core/src/index.ts";
import { appBinFirst, batchCommandLine, createCommands, findCommand, usualToolDirs } from "../src/commands.ts";

const posix = process.platform !== "win32";
const dirs: string[] = [];
const pids: number[] = [];
//? Only a PID a child printed: 0 or a negative number would signal this test's own process group.
const track = (...started: number[]) => pids.push(...started.filter((pid) => Number.isInteger(pid) && pid > 1));
afterEach(() => {
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const folder = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "akan-native-commands-")));
  dirs.push(dir);
  return dir;
};
const script = (path: string, body: string) => {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const until = async (check: () => boolean, ms = 5000) => {
  for (const started = performance.now(); !check() && performance.now() - started < ms; ) await Bun.sleep(20);
  return check();
};

/**
 * A user's shell: prints what a profile prints, counts its starts in `<dir>/starts`, puts `<dir>/tools` on PATH and
 * runs the command, as `sh -l -i -c` does once it read its files. `profile` runs first.
 */
const fakeShell = (dir: string, profile = "") => {
  mkdirSync(join(dir, "tools"), { recursive: true });
  return script(
    join(dir, "shell"),
    `echo "Last login: today"
echo "$*" >> "${dir}/starts"
${profile}
PATH="${dir}/tools:/usr/bin:/bin"
export PATH
for last; do :; done
eval "$last"`,
  );
};
const startsOf = (dir: string) => readFileSync(join(dir, "starts"), "utf8").trim().split("\n");

describe("findCommand", () => {
  test.if(posix)("takes the first executable file of that name, and no folder or file that cannot run", () => {
    const dir = folder();
    for (const name of ["first", "second", "third"]) mkdirSync(join(dir, name));
    mkdirSync(join(dir, "first", "tool"));
    writeFileSync(join(dir, "second", "tool"), "not executable");
    script(join(dir, "third", "tool"), "exit 0");
    const search = ["first", "second", "third"].map((name) => join(dir, name));
    expect(findCommand("tool", search)).toEqual({ path: join(dir, "third", "tool"), shell: false });
    expect(findCommand("missing", search)).toBeNull();
    expect(findCommand("", search)).toBeNull();
    expect(findCommand("tool", ["", ".", "third"])).toBeNull();
    expect(findCommand(join(dir, "third", "tool"), [])).toEqual({ path: join(dir, "third", "tool"), shell: false });
    expect(findCommand(join(dir, "second", "tool"), search)).toBeNull();
  });

  test("Windows tries each PATHEXT ending in order, and says which hit only cmd.exe runs", () => {
    const dir = folder();
    for (const file of ["claude.cmd", "claude.ps1", "node.exe", "node.cmd", "legacy.BAT", "notes.txt"])
      writeFileSync(join(dir, file), "");
    const windows = { platform: "win32" as const, pathExt: ".COM;.EXE;.BAT;.CMD" };
    expect(findCommand("claude", [dir], windows)).toEqual({ path: join(dir, "claude.cmd"), shell: true });
    expect(findCommand("node", [dir], windows)).toEqual({ path: join(dir, "node.exe"), shell: false });
    expect(findCommand("node.cmd", [dir], windows)).toEqual({ path: join(dir, "node.cmd"), shell: true });
    expect(findCommand("legacy", [dir], { platform: "win32" })?.shell).toBe(true);
    expect(findCommand("notes", [dir], windows)).toBeNull();
    expect(findCommand("notes.txt", [dir], windows)).toBeNull();
    expect(findCommand("claude", [dir], { platform: "win32", pathExt: ".EXE" })).toBeNull();
  });
});

describe("batchCommandLine", () => {
  test("quotes each argument for the program and escapes it twice for cmd.exe", () => {
    expect(batchCommandLine("C:\\Users\\a b\\npm\\tool.cmd", ["plain"])).toBe(
      '"C:\\Users\\a^ b\\npm\\tool.cmd ^^^"plain^^^""',
    );
    expect(batchCommandLine("tool.cmd", ["a b", "50%", "x&calc"])).toBe(
      '"tool.cmd ^^^"a^^^ b^^^" ^^^"50^^^%^^^" ^^^"x^^^&calc^^^""',
    );
    expect(batchCommandLine("tool.cmd", ['say "hi"', "dir\\"])).toBe(
      '"tool.cmd ^^^"say^^^ \\^^^"hi\\^^^"^^^" ^^^"dir\\\\^^^""',
    );
    expect(batchCommandLine("tool.cmd", [])).toBe('"tool.cmd"');
  });

  test("refuses an argument cmd.exe would cut at a line break", () => {
    for (const arg of ["one\ntwo", "one\rtwo", "nul\0"])
      expect(() => batchCommandLine("tool.cmd", [arg])).toThrow("cannot hold a line break");
  });
});

describe.if(posix)("userPath", () => {
  test("is the PATH the user's shell builds, read once, without what its profile prints or the app's bin", async () => {
    const dir = folder();
    const binDir = join(dir, "bin");
    const shell = fakeShell(dir, `PATH_BEFORE="$PATH"; echo "PATH=/a/decoy:/bin"`);
    const commands = createCommands({ binDir, shell, env: { PATH: `${binDir}:/usr/bin:/bin`, HOME: dir } });
    const [first, second] = await Promise.all([commands.userPath(), commands.userPath()]);
    expect(first).toBe(`${dir}/tools:/usr/bin:/bin`);
    expect(second).toBe(first);
    expect(await commands.userPath()).toBe(first);
    expect(startsOf(dir)).toHaveLength(1);
    expect(startsOf(dir)[0]).toStartWith("-l -i -c ");
  });

  test("a profile that never reaches the command as an interactive shell is asked again as a login shell", async () => {
    const dir = folder();
    const shell = fakeShell(dir, `case "$*" in *"-i "*) exit 0 ;; esac`);
    const commands = createCommands({ binDir: null, shell, env: { PATH: "/usr/bin:/bin" } });
    expect(await commands.userPath()).toBe(`${dir}/tools:/usr/bin:/bin`);
    expect(startsOf(dir).map((line) => line.split(" /bin/sh")[0])).toEqual(["-l -i -c", "-l -c"]);
  });

  test("a shell that hangs or tells nothing leaves the app's own PATH and the usual tool folders, and a daemon it started holds nothing up", async () => {
    const hung = folder();
    mkdirSync(join(hung, ".bun", "bin"), { recursive: true });
    mkdirSync(join(hung, ".local", "bin"), { recursive: true });
    const system = usualToolDirs(undefined);
    expect(usualToolDirs(hung)).toEqual([join(hung, ".local", "bin"), join(hung, ".bun", "bin"), ...system]);
    const stuck = createCommands({
      binDir: null,
      shell: fakeShell(hung, "sleep 30"),
      env: { PATH: `/usr/bin:${hung}/.bun/bin:/bin`, HOME: hung },
      probeTimeout: 150,
    });
    const started = performance.now();
    expect(await stuck.userPath()).toBe(
      [`/usr/bin:${hung}/.bun/bin:/bin`, join(hung, ".local", "bin"), ...system].join(":"),
    );
    expect(performance.now() - started).toBeLessThan(3000);

    const quiet = createCommands({ binDir: null, shell: "/usr/bin/true", env: { PATH: "/opt/app:/bin" } });
    expect(await quiet.userPath()).toBe(["/opt/app:/bin", ...system].join(":"));

    const dir = folder();
    const daemon = createCommands({
      binDir: null,
      shell: fakeShell(dir, "sleep 30 &"),
      env: { PATH: "/usr/bin:/bin" },
    });
    const asked = performance.now();
    expect(await daemon.userPath()).toBe(`${dir}/tools:/usr/bin:/bin`);
    expect(performance.now() - asked).toBeLessThan(3000);
  });
});

describe.if(posix)("resolveCommand and spawn", () => {
  const setup = (reapGrace = 200) => {
    const dir = folder();
    const binDir = join(dir, "bin");
    mkdirSync(binDir);
    const shell = fakeShell(dir);
    const env = { PATH: `${binDir}:/usr/bin:/bin`, HOME: dir, APP_ONLY: "from the app" };
    return { dir, binDir, tools: join(dir, "tools"), commands: createCommands({ binDir, shell, env, reapGrace }) };
  };
  const linesOf = () => {
    const lines: [string, string][] = [];
    return { lines, onLine: (line: string, stream: "stdout" | "stderr") => void lines.push([stream, line]) };
  };

  test("a tool the user installed is found on their PATH, and one the app carries comes first", async () => {
    const { binDir, tools, commands } = setup();
    script(join(tools, "claude"), "exit 0");
    expect(await commands.resolveCommand("claude")).toEqual({ path: join(tools, "claude"), shell: false });
    script(join(binDir, "claude"), "exit 0");
    expect(await commands.resolveCommand("claude")).toEqual({ path: join(binDir, "claude"), shell: false });
    expect(await commands.resolveCommand("sh")).toEqual({ path: "/bin/sh", shell: false });
    expect(await commands.resolveCommand("no-such-tool")).toBeNull();
  });

  test("the child runs with the user's PATH, answers on its pipes line by line, and says how it ended", async () => {
    const { tools, binDir, commands } = setup();
    script(
      join(tools, "echoer"),
      `echo "path $PATH"; echo "app $APP_ONLY"; read line; echo "got $line"; echo oops >&2; exit 7`,
    );
    const { lines, onLine } = linesOf();
    const child = await commands.spawn(["echoer"], { stdin: "pipe", onLine });
    expect(child.stdout).toBeNull();
    child.stdin?.write("hello\n");
    expect(await child.exited).toBe(7);
    await until(() => lines.length === 4);
    expect(lines.filter(([stream]) => stream === "stdout").map(([, line]) => line)).toEqual([
      `path ${binDir}:${tools}:/usr/bin:/bin`,
      "app from the app",
      "got hello",
    ]);
    expect(lines.filter(([stream]) => stream === "stderr")).toEqual([["stderr", "oops"]]);

    const plain = await commands.spawn(["echoer"]);
    expect(plain.stdin).toBeNull();
    expect(await new Response(plain.stdout as ReadableStream<Uint8Array>).text()).toContain("got \n");
  });

  test("a given env is the child's whole environment, and names where its command is looked up", async () => {
    const { dir, tools, commands } = setup();
    script(join(tools, "show"), "/usr/bin/env");
    const child = await commands.spawn(["show"], { env: { PATH: tools, ONLY: "this" }, cwd: dir });
    const shown = (await new Response(child.stdout as ReadableStream<Uint8Array>).text()).trim().split("\n");
    expect(shown.filter((line) => !/^(PWD|OLDPWD|SHLVL|_)=/.test(line)).sort()).toEqual(["ONLY=this", `PATH=${tools}`]);
    const missing = await commands.spawn(["show"], { env: { PATH: "/usr/bin" } }).catch((error) => error);
    expect(isAkanNativeError(missing, "NOT_FOUND")).toBe(true);
    expect(isAkanNativeError(await commands.spawn([]).catch((error) => error), "INVALID_ARGS")).toBe(true);
  });

  /** A tool that starts a helper of its own, prints both PIDs and waits. */
  const withHelper = (tools: string, after = "wait") =>
    script(join(tools, "worker"), `sleep 60 &\necho "$$ $!"\n${after}`);
  const started = async (lines: [string, string][]) => {
    await until(() => lines.length > 0);
    const [leader, helper] = (lines[0]?.[1] ?? "").split(" ").map(Number) as [number, number];
    track(leader, helper);
    return { leader, helper };
  };

  test("kill ends the child and what it started", async () => {
    const { tools, commands } = setup();
    withHelper(tools);
    const { lines, onLine } = linesOf();
    const child = await commands.spawn(["worker"], { onLine });
    const { leader, helper } = await started(lines);
    expect(leader).toBe(child.pid);
    expect(alive(helper)).toBe(true);
    child.kill();
    expect(await child.exited).toBe(143);
    expect(await until(() => !alive(helper))).toBe(true);
  });

  test("what a child left running in its group ends when the child exits", async () => {
    const { tools, commands } = setup();
    withHelper(tools, "exit 0");
    const { lines, onLine } = linesOf();
    const child = await commands.spawn(["worker"], { onLine });
    const { helper } = await started(lines);
    expect(await child.exited).toBe(0);
    expect(await until(() => !alive(helper))).toBe(true);
  });

  test("a child tied to a page ends when the page does, and is forgotten once it exited by itself", async () => {
    const { tools, commands } = setup();
    withHelper(tools);
    script(join(tools, "stubborn"), `trap "" TERM\necho "$$"\nwhile :; do sleep 1; done`);
    for (const tool of ["worker", "stubborn"]) {
      const disposers = new Set<() => unknown>();
      const document = {
        window: 1,
        id: "doc",
        ended: false,
        own(dispose: () => unknown) {
          disposers.add(dispose);
          return () => void disposers.delete(dispose);
        },
      };
      const { lines, onLine } = linesOf();
      const child = await commands.spawn([tool], { onLine, document });
      await started(lines);
      expect(disposers.size).toBe(1);
      for (const dispose of disposers) dispose();
      expect(await child.exited).toBe(tool === "worker" ? 143 : 137);
      expect(disposers.size).toBe(0);
    }
  });

  test("the children end with the app however it ends, a kill included", async () => {
    const { dir, tools } = setup();
    withHelper(tools);
    const app = join(dir, "app.ts");
    writeFileSync(
      app,
      `import { createCommands } from ${JSON.stringify(join(import.meta.dir, "..", "src", "commands.ts"))};
const commands = createCommands({ binDir: null, shell: ${JSON.stringify(join(dir, "shell"))}, env: { PATH: "/usr/bin:/bin" }, reapGrace: 200 });
const child = await commands.spawn(["worker"], { onLine: (line) => console.log(line) });
await child.exited;
`,
    );
    for (const signal of ["SIGKILL", "SIGTERM"] as const) {
      const host = Bun.spawn([process.execPath, app], { stdout: "pipe", stderr: "inherit" });
      track(host.pid);
      const reader = host.stdout.getReader();
      const { value } = await reader.read();
      const [leader, helper] = new TextDecoder().decode(value).trim().split(" ").map(Number) as [number, number];
      track(leader, helper);
      expect(leader > 1 && helper > 1 && alive(leader) && alive(helper)).toBe(true);
      host.kill(signal);
      await host.exited;
      expect(await until(() => !alive(leader) && !alive(helper))).toBe(true);
    }
  });
});

describe("appBinFirst", () => {
  test("puts the app's bin folder first on this process's PATH under one name, once", () => {
    const resources = folder();
    const kept = { ...process.env };
    try {
      expect(appBinFirst(resources)).toBeNull();
      const binDir = join(resources, "bin");
      mkdirSync(binDir);
      process.env.PATH = "/usr/bin:/bin";
      expect(appBinFirst(resources)).toBe(binDir);
      expect(appBinFirst(resources)).toBe(binDir);
      const separator = process.platform === "win32" ? ";" : ":";
      expect(process.env.PATH).toBe(`${binDir}${separator}/usr/bin:/bin`);
      expect(Object.keys(process.env).filter((name) => name.toUpperCase() === "PATH")).toEqual(["PATH"]);
    } finally {
      for (const name of Object.keys(process.env)) delete process.env[name];
      Object.assign(process.env, kept);
    }
  });
});
