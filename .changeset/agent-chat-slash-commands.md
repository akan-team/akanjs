---
"akanjs": patch
"use-agentic": patch
---

feat: the agent chat answers slash commands of its own, and the composer remembers what was sent

**Five commands join the `/` menu the app's `prompt()` endpoints already appear in**: `/new` (`/clear`) starts a
new conversation, `/retry` sends the last message again, `/copy` puts the transcript on the clipboard, `/help`
lists the commands, and `/tools` lists what this screen published. An app writes none of them and cannot add one —
the extension point for a product's own command is a `prompt()` endpoint, which is guarded and server-side.

**A built-in wins a name collision with a prompt of the same name**, and a shadowed prompt is dropped from the menu
rather than listed twice. That is the mirror image of the tool rule, deliberately: a component's `st.tool` shadows a
built-in it means to replace, but no library's prompt may take `/new` away from the user who typed it. `/new` and
`/copy` are also dispatched ahead of the is-a-turn-running check, because mid-turn is exactly when they are reached
for — so `AgentSession.reset` now ends the turn it is clearing and waits for it to wind down. It used to return
silently while one was running, and clearing before the abort lands leaves the dying turn appending onto an empty
transcript.

**A command's output is a `local` message: rendered in the transcript, withheld from the wire.** The transcript
*is* the model's history, so `/help` text appended plainly would come back on the next turn as something the
assistant believes it said. `session.note(text)` writes one, `session.report(error)` stays what a host-side failure
lands in, and `local` messages are left out of a `/copy` export — they are the chat talking to itself.

**`/copy` exists because nothing else keeps the transcript.** The relay is stateless and the conversation lives only
in that browser, so an export is the one path a wrong answer has to whoever could fix it; it carries the route and
the timestamp for that reason. **`session.retry()`** replays only the trailing user message and leaves everything
before it in place, so a prompt's own preamble is not sent twice.

**↑ and ↓ in the composer walk what was sent.** A single-line input has nothing of its own on the vertical arrows,
and the half-written draft they were walked away from comes back at the bottom of the walk — the other half of why
a turn that fails for a reason unrelated to the ask no longer means retyping it.
