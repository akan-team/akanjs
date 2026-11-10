---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan doctor` exits with code 1 when its report says `"status": "failed"`, in text or JSON, with or without `--strict`, and for `--ios`, so the `agent:doctor` script (`akan doctor --strict --format json`) or a CI step fails on it. Before, it always exited 0. The full report still prints on stdout. A warning never changes the exit code: `--strict` still only decides which conventions count as errors, today a missing module abstract. Doctor's `dictionary-label-missing` now reads both a constant's fields and its dictionary's labels from their syntax, ignoring comments and strings. A field that appears only in a comment no longer asks for a label: a new `--sample` workspace no longer warns about `task`'s `priority`, `tags`, `assignee` and `completedAt` or `workHistory`'s `actor` and `previousStatus`, which its constants suggest only in comments. A label that exists only in a comment, or a `name:` inside a string, no longer counts, so a field whose label is commented out now warns.
