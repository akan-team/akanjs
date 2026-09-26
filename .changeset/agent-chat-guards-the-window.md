---
"use-agentic": minor
"akanjs": minor
---

The in-page chat guards the model's window, and answers a refusal for length by compacting once

Compaction used to watch one number: the transcript, estimated at four characters a token, against `compact.at`
(24k). It did not know the window, did not count the tools, the screen context or the instructions that ride every
turn, and read Hangul — nearer one character a token than four — as a fraction of what it costs. Measured on a
single live DeepSeek turn: the transcript estimate said 23 tokens where the provider counted 458. And when the
provider refused a prompt too long for its window, the turn simply failed.

**The relay now reports what it knows.** Every turn's `done` carries the provider's own count (`usage: { input,
output }`, `input` the whole prompt) and what the adaptor knows about its model (`limits: { window, output }`).
The window is declared with `option.setLlm({ contextWindow })` — a table of models would be a claim about models
that ship after it. `LlmAdaptor` gains an optional `limits`; `AnthropicLlm` reports the answer ceiling it always
sends, `OpenaiLlm` sends none and so reports none.

**The session compacts on whichever trigger comes first.** `compact.at` stays, with its 24k default, as a ceiling
on what each turn costs — the relay resends the whole transcript every turn and the app pays for each one. Beside
it, once the window is known, a guard compacts when the prompt passes `window − answer ceiling (8,192 when
unreported) − compact.buffer (13,000)`, measured by the provider's count of the last turn plus the estimate for
what arrived since. `{ at: Infinity }` leaves only the guard; `{ at: 0 }` still turns all of it off. The count is
kept on the assistant message (`ChatMessage.usage`), never sent, and dropped from what a compaction keeps.

**A refusal for length is answered once.** Adaptors build refusals through `LlmOverflow.refusal(host, status,
reason)`, which reads each provider's own "prompt too long" sentence as `agent.error.contextOverflow` with the
`limit` it named. The relay flags it `overflow` on the wire; the session drops the empty draft, compacts, sends the
same turn again and remembers the window. A second refusal in the same send fails with the translated message.
An app's own adaptor that throws through `LlmOverflow.refusal` recovers the same way.

The chat header now reads `~31k / 107k tokens` — the estimate against whichever trigger is nearer — with the point
it compacts at in its tooltip.

## Upgrading

Nothing is required. To turn the guard on, declare the window your model has:

```ts
option.setLlm({ apiKey, model: "deepseek-flash", host: "https://api.deepseek.com", contextWindow: 1_000_000 });
```

A backend of your own that speaks the turn wire (use-agentic `WIRE.md`) opts in by adding `usage` and `limits` to
its `done` event and `overflow: { limit? }` to a refusal for length; one that sends neither keeps working as before.
The usage, limits and overflow fields ride the streaming answer — which is what `httpRunner` negotiates — and are
not added to the relay's single-JSON `AgentTurn` answer.
