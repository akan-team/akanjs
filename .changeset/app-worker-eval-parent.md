---
"akanjs": patch
---

`AppWorker.spawn` runs the worker when the server itself was started as `bun -e <code>`: under `akan start`, and in a backend a gateway starts.

Such a server handed its own start code on to the worker's command, so the child ran the server's code again with the worker file as an argument, exited with 1 and was started again every second: the worker never ran, and the log showed `[Worker:<name>] WARN exited 1; restarting in 1000ms` over and over. A server started from its file (`bun main.js` with no backends of its own) was not affected. The same command builds the `ops snapshot` and `ops migrate` children, which now leave the start code out as well.
