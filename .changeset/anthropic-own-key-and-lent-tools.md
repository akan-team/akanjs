---
"akanjs": minor
---

`AnthropicLlm.of(option)` builds an Anthropic adaptor with settings of its own, beside `option.setLlm`. An app adaptor that sends some turns to Anthropic under a separate key keeps the instance and calls its `chat`. It keeps the history retries (drop_block, then no thinking) and the fallback for models without tool changes, along with what each one learned per conversation and per model. `AnthropicLlmOption` adds two settings, available through `option.setLlm` as well:

- `body(body, request)` has the last word on each request body after the adaptor has picked its form, for example to add a `cache_control` breakpoint or `output_config.effort`.
- `betas` lists `anthropic-beta` values to send alongside the ones a retry adds.

A page's lent tools (`clientTools`) now keep their place in the history the way toolkit tools do. A run that lends tools stores `listed` on each answer, plus `lent`, which holds each lent definition once: on the answer that first listed it, or that listed a changed one. A later run whose page lends other tools passes the earlier definitions on as `deferred`. `AnthropicLlm` declares them and announces them withdrawn with `tool_removal`, so a screen change no longer rewrites the tool list that earlier thinking was bound to. A stored definition never takes a name the server answers, and storage keeps each name's newest definition only, within the ceilings a request's own `clientTools` meets. `lent` is not sent with the messages. Upgrading needs no step; store `lent` with the rest of the transcript.
