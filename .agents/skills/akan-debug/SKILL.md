---
name: akan-debug
description: "Debug a running Akan app: where the dev-server log is, how to read it, and how to tell a runtime failure from a build one."
---

<!-- akan:generated -->

# Akan debug

## The log is a file, and that file is the whole session

A supervised `akan start` writes **`local/apps/<app>/runtime/dev.log`** — no ANSI, nothing truncated, every
process of the app in arrival order, including the dev host's own build output, which reaches no other
file. The previous session is kept beside it as `dev.prev.log`.

Read that file. Do not ask for a paste of the terminal: the full-screen view repaints one frame in place, so
what survives in the scrollback is bordered and truncated to the pane.

- `tail -n 200 local/apps/<app>/runtime/dev.log` after an edit, to see what the reload produced.
- `akan logs <app>` tails a running server with `--level --grep --endpoint --trace --child --role --origin
  --since` and `--json`.
- The dev server's URL is printed in that log, and the port is allocated rather than fixed — the log is the
  only source for it.

## Which loop you are in

- **A type or lint failure** is the `akan-validate` loop: `akan verify`.
- **A runtime or SSR failure** is the dev log. The page renders blank, an overlay appears, or a request
  500s — none of that shows up in a typecheck.

If a dev server is already running for the app, do **not** start another. If it looks wedged, surface the
log tail in your answer rather than killing it.

## Reading a log line

Every `Logger` call carries `traceId`, `endpoint` and `origin` alongside the message, so one request's lines
share a trace — `akan logs <app> --trace <id>` pulls just that request. The level ladder is
`trace verbose debug info warn error`; `.log()` is deprecated and emits at `info`, which is why a call that
reads like its own level is not one.

## Before you conclude

A change that renders is not a change that passed. Run `akan verify`; for a `.tsx` change it also runs the
SSR check, since a UI edit that moves markup into a client bundle typechecks perfectly.
