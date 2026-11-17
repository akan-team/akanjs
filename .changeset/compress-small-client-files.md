---
"@akanjs/devkit": patch
---

A built app serves its client files under 1 KB compressed too. `akan build` wrote a `.br` and `.gz` beside a file only from 1 KB up, and a page loads hundreds of smaller ones: re-export stubs, single icons, a model's runtime pieces. Each now gets its compressed copies whenever they come out smaller than the file. A page of the sample apps downloads 6 to 8 KB less JavaScript, and a page of a large app that loads about 500 files, 230 of them under 1 KB, about 44 KB less. The Route JS report and budget count what is served, so their numbers fall by the same amount.
