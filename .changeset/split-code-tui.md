---
"@akanjs/cli": patch
---

Internal: the `akan code` terminal UI is composed from collaborators instead of one 117-member `CodeTui` class: `CodeTuiFrame` (layout and the chrome around the transcript), `CodeTuiPrompt` (the input box, history, completion menu and image attachments), `CodeTuiQuestion` (questions and approvals), `CodeTuiOverlay` (overlays and the session picker) and `CodeTuiCommandRunner` (the slash commands that reach the agent or its config). Frames, keys, prompts, MCP sign-in and sub-agents behave as before, and `CodeTui`'s public members are unchanged.
