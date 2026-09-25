---
"akanjs": patch
"use-agentic": patch
---

feat: the in-page agent can ask the user instead of guessing

`askUser` is a fourth built-in on every turn, and the **session** owns it rather than the surface: the answer comes
from the conversation, not the screen, so it needs no declaration from the page and a zone agent asks inside its own
transcript. `AgentSession` parks the loop on `pendingQuestion` exactly as it parks on `pendingApproval`, and
`Agent.Chat` renders the question card above the composer — which is closed anyway while a turn runs, so the card is
the only way in.

`choices` offers a pick (`multiple` for several) and omitting them asks for free text. The card keeps a free-text row
either way, because the model wrote the options and only the user knows whether the right answer is among them.
Dismissing is the tool's **error** result rather than a silent empty answer, so a model that asked cannot read a
skipped question as consent; an aborted turn settles the same way. A question with no text is refused without ever
reaching the screen, and choices are trimmed and deduped because the answer is the option's own text — two identical
options cannot be told apart.

A settled ask renders as the exchange it was, question then answer, instead of as a `askUser` tool row: while the
question is pending only the card holds it, so the text is never on screen twice. A hook tool named `askUser` shadows
the built-in like any other, and the relay needed no change — the tool rides the same wire the surface's own do.
