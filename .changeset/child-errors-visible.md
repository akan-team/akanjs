---
"akanjs": patch
---

A server process the gateway runs now shows its Logger errors in the terminal. Under `akan start`, the stack of a failed endpoint appeared only in the rotating log file, because the gateway hides a child's stderr unless `AKAN_CHILD_STDERR=1`.
