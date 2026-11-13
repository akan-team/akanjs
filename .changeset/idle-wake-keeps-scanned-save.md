---
"@akanjs/devkit": patch
---

A dev server waking from idle suspend now applies every save made while it was suspended, including one its idle watcher was still scanning when a request woke it. Such a save used to be dropped, so an `akan.config.ts` change made just before a page request kept the old config until the next config save.
