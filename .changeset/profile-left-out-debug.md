---
"@akanjs/devkit": patch
---

A `--profile` build names the lib env defaults it leaves out in one debug line, no longer a warning.

A profile such as `edge` runs without the cloud's secrets on purpose, so the line appeared on every correct build. `AKAN_PUBLIC_LOG_LEVEL=debug akan build <app> --profile <name>` still prints it.
