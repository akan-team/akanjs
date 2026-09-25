---
"akanjs": patch
---

Open the in-page agent's session to the host: a custom transcript store, a narrowed built-in tool set, and the
types a replacement transport needs.

- `persist` now takes a `SessionHistory` (`{ load, save, clear }`) as well as the web-storage option, and all
  three methods may answer asynchronously — a transcript can live on a server. A `load` still in flight when the
  user sends the first message is dropped rather than merged, and saves are chained so a slow store cannot land
  an older transcript last. `session.isRestoring` reports the in-flight load — a host that opens with a prompt of
  its own waits for it, since sending on mount is a race the restore loses.
- `builtins` on `Agent.Chat` and `Agent.Zone` picks which of the runtime's own tools a session gets (`false` for
  none, an array for exactly those). A withheld name answers the same "unknown tool" an unregistered one does.
  This is the only way to drop `navigate` inside a zone, where a same-named hook tool is registered under its
  scope prefix and never shadows the built-in.
- `Agent.Zone` takes a `session` the app built (and then does not abort it on unmount) and reports it through
  `onSession`. `Agent.Chat` takes `chrome={false}` to drop the header bar and `defaultDraft` to open with text
  in the composer; a panel controlled without an `onOpenChange` draws no close button instead of an inert one.
- `onCompact(replaced, summary)` reports a compaction's cut, for a host keeping its own summary watermark.
- `akanjs/ui` now exports `httpRunner`, `fetchRunner`, `AgentSession`, `AgentProvider` and the `AgentRunner` /
  `RunnerRequest` / `RunnerEvent` / `ChatMessage` / `SessionHistory` / `PublishedTool` / `ContextBlock` types.
