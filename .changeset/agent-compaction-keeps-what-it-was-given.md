---
"use-agentic": patch
---

fix: an in-page conversation no longer compacts away a screenshot, or most of its own earlier summary

Two faults in how the transcript summarizes itself, both reproduced against the shipped defaults.

**A picture was counted by its bytes.** The estimate is four characters to a token over the JSON a turn posts, and an
inlined image's base64 is part of that JSON — so a 300KB screenshot read as about 100k tokens, four times the 24k
threshold. The conversation compacted as soon as it passed six messages, which on a task that runs tools is the third
call, and the screenshot the user attached to ask about went into the summary as a filename. A provider bills a
picture by its pixels after its own downscale, so an inlined image now counts as `Compaction.imageTokens` (1,600)
instead. An image attached by `url`, and a text attachment, are counted as before.

**A previous summary was clipped to 1,200 characters.** The digest clipped every message's text, and the summary is a
message, so the second compaction carried only the first 1,200 characters of the first one forward — and each one
after lost more. It was also labelled `user:`, so the summarizer read the notes as something the user had said. A
previous summary now rides the digest whole, under a `previous summary:` label and outside the digest's budget, and
the summarizing instruction asks for it to be carried forward.
