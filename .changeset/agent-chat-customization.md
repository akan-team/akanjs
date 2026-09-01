---
"akanjs": patch
---

feat: the in-page chat is customizable per part, opens from the app's own control, and composes multi-line

**Eight slots replace what the chat renders, so a skin no longer means replacing the panel.** `AgentLauncher`,
`AgentBubble`, `AgentComposer`, `AgentApproval`, `AgentQuestion`, `AgentMenu`, `AgentMarkdown` and `AgentCode`
each bind in `_overrides.tsx` beside the existing `AgentChat`, and `akanjs/ui` exports every default next to them
(`DefaultBubble`, `DefaultComposer`, …) so a replacement composes the one it is replacing instead of
re-implementing the loop, the slash commands and the approval gate. `AgentCode` is the seam a highlighter binds
to — the markdown scanner now keeps the fence's language, which it used to drop. A component bound to
`AgentBubble` carries its own `memo`: the transcript re-renders on every streamed delta.

**The panel takes a controlled `open`/`onOpenChange` pair, so an app opens the chat from its own control.**
Conditional mounting was not a substitute — unmounting aborts the session and discards the conversation.
`launcher={false}` draws no launcher for an app that has its own entry point, `launcherClassName` /
`panelClassName` reach one surface each where `className` reaches both, `intro` replaces the empty-state line
(where starter questions go) and `header` adds controls beside the built-in clear and close.

**The composer is a textarea**: Enter sends, Shift+Enter writes a newline, and it grows to a few lines before it
scrolls. The vertical arrows still walk what was sent, but only from the first or last line — anywhere else the
caret belongs to the textarea. It resolves its field shell through the `input` recipe slot, so a recipe swap
reaches it like every other field.

**On a phone the panel is the whole screen**, a card from `sm:` up, and it lifts above the on-screen keyboard —
only `visualViewport` reports that inset, and a full-screen chat whose composer sits under the keyboard is one
nobody can type into.

`SessionContext`, `useAgent`, `agentSessionOf`, `ChatCommands` and the parts' prop types are exported too: an app
may not import `use-agentic`, and without them a replacement could not see the session an `Agent.Zone` handed down.
