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

  test("a harmless variable set in front of a command does not change its name", () => {
    expect(names("CI=1 NODE_ENV=test bun test")).toEqual(["bun test"]);
    expect(
      names("FORCE_COLOR=0 NO_COLOR=1 TZ=UTC LANG=C LC_ALL=C.UTF-8 TERM=dumb DEBUG=app:* PORT=3000 bun test"),
    ).toEqual(["bun test"]);
    expect(names("CI=1; ls")).toEqual(["ls"]);
  });

  test("any other variable set in front of a command, or one whose value is not a plain word, has no name to remember", () => {
    for (const line of [
      "GIT_SSH_COMMAND='ssh -i key' git status",
      "PATH=/tmp/bin git status",
      "GIT_PAGER=less git log",
      "LD_PRELOAD=./x.so ls",
      "BASH_ENV=./x.sh ls",
      "NODE_OPTIONS=--require=./x.js bun test",
      "CI=1 PATH=/tmp/bin ls",
      "PATH=/tmp/bin; git status",
      'CI="1" bun test',
      "CI=\\1 bun test",
      "CI=$X bun test",
      "CI=$(date) bun test",
      "CI+=1 bun test",
      "TZ=~/zone ls",
      "'CI=1' ls",
    ])
      expect(names(line)).toBeUndefined();
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

  test("a command the shell itself uses to run another, or to set what a later one runs, has no name to remember", () => {
    for (const line of [
      "builtin eval ls",
      "source ./x.sh",
      ". ./x.sh",
      "trap 'ls' EXIT",
      "alias a='ls'",
      "coproc ls",
      "export PATH=/tmp/bin",
      "declare -x A=1",
      "typeset -x A=1",
      "readonly A=1",
      "ls && export CI=1",
    ])
      expect(names(line)).toBeUndefined();
  });

  test("a redirection that opens a connection has no name to remember", () => {
    for (const line of [
      "bun test </dev/tcp/host/80",
      "bun test < /dev/udp/host/53",
      "cat <//dev/tcp/host/80",
      "ls > /dev/tcp/host/80",
      "ls 3<>/dev/tcp/host/80",
      "sort < $FILE",
    ])
      expect(names(line)).toBeUndefined();
    expect(names('grep -c x <<< "$VALUE"')).toEqual(["grep"]);
  });

  test("a command that sends something out of the machine has no name to remember", () => {
    for (const line of [
      "npm publish",
      "pnpm publish --no-git-checks",
      "yarn publish",
      "yarn npm publish",
      "bun publish",
      "cargo publish",
      "docker push repo/image",
      "ls && npm publish",
    ])
      expect(names(line)).toBeUndefined();
  });

  test("gh is named two words deep, and gh api has no name to remember", () => {
    expect(names("gh pr view 12")).toEqual(["gh pr view"]);
    expect(names("gh issue list --state open")).toEqual(["gh issue list"]);
    expect(names("gh status")).toEqual(["gh status"]);
    expect(names("gh pr view 12 && gh pr merge 12")).toEqual(["gh pr view", "gh pr merge"]);
    for (const line of [
      "gh",
      "gh api repos/o/r",
      "gh api -X POST repos/o/r",
      "gh pr --repo o/r merge 12",
      "gh -R o/r pr view",
    ])
      expect(names(line)).toBeUndefined();
  });

  test("a line continued after a space joins its words, and one continued inside a word joins the word", () => {
    expect(names("git \\\npush")).toBeUndefined();
    expect(names("git \\\n  push origin main")).toBeUndefined();
    expect(names("git \\\nstatus")).toEqual(["git status"]);
    expect(names("git\\\npush")).toEqual(["gitpush"]);
    expect(names("git \\\r\npush")).toBeUndefined();
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
