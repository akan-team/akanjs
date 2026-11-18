---
"@akanjs/devkit": patch
---

fix(devkit): `akan build` prints one plain line per phase where its output is not a terminal

Run by an agent, a CI job or behind a pipe, `akan build` printed each phase twice (a start line, then an end line
with a coloured tick) and, between them, a coloured logger line carrying a process id and a timestamp:
`[client-runtime] 34 routes load per module, …`.

- Where stderr is not a terminal, a phase is one uncoloured line on stdout when it ends,
  `✓ Compiling backend: 4 entrypoints, 37 outputs (148ms)`, and `✗ <phase> failed` on stderr when it fails. A
  terminal keeps the spinner.
- The client-runtime count is part of the SSR phase's line everywhere:
  `Building SSR route artifacts: 34 routes, 42 entries; 34 routes load per module, …`. `akan quality runtime` still
  prints it with its reasons.
