---
"akanjs": patch
"@akanjs/language": patch
---

Internal: the web router's route table is built by one collaborator per route family instead of one 437-line method. Routes, their order, headers, caching and error answers are unchanged. The framework map now follows a send through a field that hands out its receiver (`this.#hub()?.broadcast(...)`), so `ARCHITECTURE.md` still names who sends each HMR message.
