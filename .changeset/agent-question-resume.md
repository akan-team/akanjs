---
"use-agentic": minor
"akanjs": patch
"@akanjs/cli": patch
---

A restored chat transcript that ends on an unanswered `askUser` call now opens on that question instead of closing it. This covers a server run that parked on a question while no chat was open, and a page reloaded mid-question.

- The session's `pendingQuestion` holds the question, so `Agent.Chat` draws its card and the composer answers it as usual.
- Answering or dismissing it appends the `askUser` result (or the dismissal's error) and runs a turn through the runner, which carries the answer back to wherever the question came from.
- A turn started first, `reset()` and `compact()` take the question down. The call is then closed as unanswered on the wire, as before.
- Only the first unanswered call of the last batch reopens, and only when it asks something. Calls after it are closed as unanswered when the transcript is restored.
- `Transcript.sanitize(messages, openCallId?)` takes the id of one call to leave unanswered.

Before this, a reload in the middle of a question closed the call as stopped. It now asks again, so no upgrade step is needed.
