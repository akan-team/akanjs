---
"akanjs": patch
---

Back a zone's transcript from a mounted `<Agent.History />` instead of a `persist` prop, so the zone can be
assembled by a server component.

A `SessionHistory` is functions, and a function cannot cross the server/client boundary as a prop — so
`persist={myStore}` made every ancestor up to whoever builds the session a client component, which for a zone is
the whole subtree. `<Agent.History load save clear onCompact />` is a leaf that attaches the store to the
enclosing session, in the shape `Agent.Guide` already uses, and renders nothing. `Agent.Zone`'s other props were
already serializable, so the zone and the chat inside it can now be server-rendered.

Restoring follows the rule an async `load` already followed: it lands only while nothing has happened to the
conversation yet. Mounting with the zone restores; mounting later saves from there on, and the store is never
asked for a transcript that would be discarded. `AgentSession.setHistory` / `setOnCompact` back it, for a session
an app built itself.

`setHistory` and `setOnCompact` return a detach that clears the slot only while their own value is still in it,
so a remount's cleanup cannot silently stop the saving of whoever attached after it. The store lives exactly as
long as the component; a host that wants it to outlive the view attaches it on the session itself.

Also documents that `open` without `onOpenChange` draws no close button — a fixed panel with nowhere to close to,
and the shape that keeps a controlled chat free of function props.
