---
"akanjs": minor
"use-agentic": minor
---

An MCP App view shows the page its tool named, not the app around it. Every layout above the page still runs — its guards, providers, effects and `<Agent.Guide>` — but what it draws around `{children}` is hidden and the page is drawn on its own, so a tab bar, a side rail or a section header never lands in the chat. Nothing is written for the view: the same page serves the web.

- **A layout's chrome takes nothing.** `Layout.Navbar`, `TopInset`, `BottomInset` and `BottomTab` drawn by a hidden layout take no frame slot, the `topInset` / `bottomInset` a layout declares is dropped, and the tools its controls publish are kept off the view's surface while its guidance still reaches the model.
- **A gate stays a gate.** A layout that draws no page — a sign-in notice, a redirect screen — is the content then, and is shown.
- **The first screen has no back.** The navbar of the screen a view opened on draws no back button; one pushed over it does.
- **`AgentActivity` takes `keepGuides`** (use-agentic): a subtree that is off screen publishes no tools or state but keeps saying its guidance, and `AgenticSurface.gated(gate, guideGate)` names the gate guidance follows.
