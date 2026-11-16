---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan quality runtime` reports, for each app and library, how many client files read the generated client runtime (`st`, `fetch`, `sig`, a cast to `RootStore`) only by names one module answers, and prints a note, `akan.runtime.whole-scope`, at each file that reads it by a computed key, through a cast, hands it on, re-exports it or imports it whole, so a page that loads that file loads the scope's whole client runtime. The notes never fail a command and change no build: the file works as it is. Each line also says how long reading the scope took. The report reads every name from module source, the store, signal and constant files of the scope and the libraries it loads, and a test checks those names against the ones the generated runtime answers.
