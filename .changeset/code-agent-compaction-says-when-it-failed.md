---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix: `akan code` says when compaction failed, leaves the Claude Code-sized buffer, and resolves its default model

**A failed compaction read as a successful one.** The engine reports a compaction that failed or was cancelled on
the same `compaction_end` event as one that worked, with `errorMessage` and `aborted` beside the reason. The wire
kept only the reason, so every end printed "Compacted the conversation" — including an automatic compaction that
had failed, which nobody else reports, leaving the next sign of it an overflow error turns later. The `compaction`
frame now carries `error` and `aborted`, and the transcript prints the engine's own sentence as a warning, or
"Compaction cancelled.". A failed `/compact` still reports once, through the caller it threw to.

**The buffer is 32,768 tokens, up from the engine's 16,384.** On a million-token window that moves the threshold
from 98.4% to 96.7% — where Claude Code compacts. The reserve is all the room the response at the threshold gets
(the request clamps its output to the window less the prompt less 4,096), so at 16k a reasoning model ran out
mid-thought there and the recovery re-sent a near-full window to retry. It is also the summary's output cap at 80%.
The small-window warning now reads the settings the session actually runs with rather than the engine's defaults.

**The default model is `deepseek/deepseek-flash`.** `deepseek-v4-flash` is gone from both the engine's catalogue
and DeepSeek's own model list, so the default resolved to nothing and `akan code` silently ran on whichever model
sorted first among those with a key.
