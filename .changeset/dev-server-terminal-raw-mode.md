---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(cli): stop `akan start` from leaving the terminal in raw mode, which killed Ctrl+C

A dev server that had been running for a few minutes stopped responding to Ctrl+C. The cause was not
signal handling — the terminal had been left in **raw mode**, so with `isig` off the tty never turned
`^C` into SIGINT at all. `kill -INT <pid>` still ended the process instantly, which is the tell.

A Bun child snapshots the controlling terminal's termios when it is spawned and writes that snapshot
back when it exits. ora's `discardStdin` holds the terminal raw for as long as a spinner runs, and the
dev host spawns the builder and the backend under the "Preparing backend..." spinner — so those
children snapshot a raw terminal. The spinner then restores it and Ctrl+C works, which is why a fresh
`akan start` behaved. The first dev-host recycle (an `akan.config.ts` change, or regenerated runtime
metadata such as `dict.ts` / `sig.ts`) SIGTERMs the builder, and its exit writes the stale raw termios
back over a terminal nobody restores again. `Spinner` no longer takes stdin.

Two nearby hazards with the same symptom are fixed as well.

`Spinner` refuses to animate against a tty that reports **0 columns** — an unsized pty, which CI
runners, `expect`/`script` harnesses and some detached panes produce. ora sizes its clear loop as
`ceil(lineWidth / stream.columns)`, so zero made it `Infinity`: measured 750MB of cursor moves and
8.7GB RSS inside a minute, in a loop past the point where SIGINT or SIGTERM could be handled, leaving
SIGKILL as the only way out. Such a terminal now gets plain lines.

`akan start`'s local-database teardown no longer hangs the exit. Registering a SIGINT listener
replaces the kernel's "terminate now", so that handler became the only thing that could end the
process — and it exited only if `docker compose down` succeeded. The teardown is now bounded
(`ApplicationScript.dbShutdownTimeoutMs`, 20s), the exit runs even when it fails or times out, and a
second Ctrl+C abandons it instead of queueing behind the first.
