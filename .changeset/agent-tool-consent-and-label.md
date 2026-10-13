---
"akanjs": minor
"use-agentic": minor
---

An agent's tool call runs only as the action the screen declared when the call arrived. After the user approves, and again right before it runs, the runner requires the same declaration under that name — the same description and parameters, and the same confirm message for the approved arguments — rather than the same registration, so a list row mounting while the user decides no longer cancels an approval, and a different declaration that took the name over is refused with "<name> changed on screen before it ran, so it did not run." `st.tool(name, { label })` (use-agentic's `ToolEntryBase.label`) names an action for a person, in their language, and is never sent to the model; `Agent.useScreenActions()` hands it out as `label` and leaves out the tools a person answers with a card.

Upgrade note: the check covers calls that need no approval too. Such a call used to run whatever registration held its name by then; it now returns that refusal to the model when the declaration under the name changed after the call arrived.
