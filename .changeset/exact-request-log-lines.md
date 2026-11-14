---
"akanjs": patch
---

The ndjson stdout and the log file now get every log record, and a request line (`AKAN_LOG_CANONICAL`) is never folded as a repeat, so counting request lines counts requests. Before, a line repeated more than 20 times a second was folded into one "suppressed" line before either output saw it, and request lines folded too because their attrs were ignored: 101 requests wrote 21 lines and a summary.

The folding now applies only to what the hub keeps in memory: the ring that `akan logs`, history and resumes read, and the live tails fed from it. The `seq` on a stdout line can now skip a number, where a fold line sits in the ring.
