---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan start` binds the port `PORT` names.

`PORT=28284 akan start face` started the dev server on the app's derived port (8282 plus its place in the app list) and said nothing about the value it dropped, while the built server (`bun main.js`) honours `PORT`. Only `AKAN_DEV_PORT` moved a dev server.

`AKAN_DEV_PORT` still wins. Without it, a usable `PORT` pins the dev port the same way, for every command that looks for the dev server (`akan start`, `--kill`, `akan preview`); several apps started together count upward from it. A workspace whose shell or root `.env` already sets `PORT` for another purpose now starts its dev server there: set `AKAN_DEV_PORT` to keep the old port.

The runtime guide gains three lines on the dev port, so the budget of `runtimeRule-1.md` is raised to 19287 bytes.
