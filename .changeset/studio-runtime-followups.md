---
"akanjs": patch
---

Akan Studio opens without a dev builder, and names every job in full.

- **`/_akan/studio` with no dev builder** lands on the Runtime view, which reads the running server, instead of answering 503 with nothing to click. A view that needs the builder (ERD, Signals, Changes, Framework) still answers 503, now inside Studio's header and nav, saying to open it under `akan start` and that Runtime needs no builder. A failed build shows its error the same way.
- **Each job row** carries its full name and schedule as a tooltip (`cron syncAccountBalances · 0 * * * *`), with the skip reason below it for a job this server does not run, so two long names clipped alike can be told apart.
