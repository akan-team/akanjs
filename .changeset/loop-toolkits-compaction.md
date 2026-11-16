---
"akanjs": patch
---

`agentService.loop` keeps fewer tools in a long run's requests. A compaction closes each toolkit from `toolkits` that the messages it keeps neither opened nor called a tool of, and the model opens it again with `openToolkit` when it needs it. Remotes stay open. `compact.at` now counts the round's tools, instructions and context along with the transcript, so a run with a large tool list compacts before the provider refuses the request, not after. An opened toolkit's tools are listed after every tool already listed, in the order the toolkits were opened, so opening one leaves the start of the tool list unchanged.
