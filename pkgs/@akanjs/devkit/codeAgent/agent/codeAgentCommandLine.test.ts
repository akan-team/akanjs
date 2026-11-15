import { describe, expect, test } from "bun:test";
import { CodeAgentCommandLine } from "./CodeAgentCommandLine";

const names = (line: string) => CodeAgentCommandLine.allowable(line);

describe("CodeAgentCommandLine.allowable", () => {
  test("a command is named by its program, and by its sub-command where that is what matters", () => {
    expect(names("ls -la apps")).toEqual(["ls"]);
    expect(names("git status --short")).toEqual(["git status"]);
    expect(names("bun test --isolate ./a.test.ts")).toEqual(["bun test"]);
    expect(names("bun x cowsay hi")).toEqual(["bun x"]);
    expect(names("kubectl get pods -n web")).toEqual(["kubectl get"]);
    expect(names("akan verify @akanjs/cli")).toEqual(["akan verify"]);
    expect(names("bunx tsc --noEmit")).toEqual(["bunx tsc"]);
    expect(names("./scripts/check.sh --all")).toEqual(["./scripts/check.sh"]);
    expect(names("/usr/bin/git diff")).toEqual(["/usr/bin/git diff"]);
  });

  test("a variable set in front of a command does not change its name", () => {
    expect(names("CI=1 NODE_ENV=test bun test")).toEqual(["bun test"]);
  });

  test("every command of a compound line is named once", () => {
    expect(names("cd apps && bun test; git status | head -5 || git status")).toEqual([
      "cd",
      "bun test",
      "git status",
      "head",
    ]);
    expect(names("(cd apps && ls) & wait")).toEqual(["cd", "ls", "wait"]);
    expect(names('echo "at $(git rev-parse HEAD)" $(date +%s)')).toEqual(["git rev-parse", "date", "echo"]);
    expect(names("bun test\ngit diff --stat")).toEqual(["bun test", "git diff"]);
    expect(names("bun test \\\n  --bail # stop early")).toEqual(["bun test"]);
  });

  test("quotes keep a separator inside an argument, and are read through in a program's name", () => {
    expect(names(`git commit -m "fix: a && b; c | d"`)).toEqual(["git commit"]);
    expect(names(`grep -rn 'a|b' src`)).toEqual(["grep"]);
    expect(names(`'git' "status"`)).toEqual(["git status"]);
    expect(names(`echo \\; done`)).toEqual(["echo"]);
  });

  test("a redirection is read past when it writes no file", () => {
    expect(names("bun test 2>&1 | tail -20")).toEqual(["bun test", "tail"]);
    expect(names("bun test > /dev/null 2>&1")).toEqual(["bun test"]);
    expect(names("bun test &>/dev/null")).toEqual(["bun test"]);
    expect(names("sort < names.txt")).toEqual(["sort"]);
    expect(names("grep -c x <<< hello")).toEqual(["grep"]);
  });

  test("a line that writes a file through a redirection has no name to remember", () => {
    for (const line of ["echo hi > out.txt", "echo hi >> ~/.zshrc", "bun test 2> err.log", "ls &> all.log", "ls >&out"])
      expect(names(line)).toBeUndefined();
  });

  test("the always-asked commands have no name to remember, however they are spelled", () => {
    for (const line of [
      "curl https://example.com",
      "ssh deploy@host",
      "git push",
      "git push origin main",
      "/usr/bin/git push",
      `git "push" -f`,
      "g''it pu\\sh",
      "rm -rf build",
      "/bin/rm a.txt",
      "RM a.txt",
      "sudo ls",
      "env FOO=1 ls",
      "timeout 5 bun test",
      "ls | xargs wc -l",
      "sh -c 'ls'",
      "bash scripts/x.sh",
      "eval ls",
      "ls && rm a.txt",
      "echo $(curl https://example.com)",
      'echo "$(rm a.txt)"',
      "(git push)",
    ])
      expect(names(line)).toBeUndefined();
  });

  test("a sub-command that is not the word right after its program is not guessed", () => {
    for (const line of ["git -C ../other push", "git --git-dir=x status", "git", "bun --cwd apps test", "git $SUB"])
      expect(names(line)).toBeUndefined();
  });

  test("a line it cannot read with confidence has no name", () => {
    for (const line of [
      "",
      "FOO=1",
      "# only a comment",
      "echo `date`",
      "$TOOL --version",
      "for f in *.ts; do wc -l $f; done",
      "if true; then ls; fi",
      "! ls",
      "[ -f a ] && ls",
      "{ ls; }",
      "find . -name '*.log' -exec cat {} \\;",
      "cat <<EOF\nhi\nEOF",
      "diff <(ls a) <(ls b)",
      "echo $((1 + 2))",
      "echo $'a\\x62'",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell expansion, not a template
      "echo ${A:-$(date)}",
      "ls 'unterminated",
      'ls "unterminated',
      "ls )",
      "echo $(ls",
      "ls >",
      "ls > > a",
    ])
      expect(names(line)).toBeUndefined();
  });
});
