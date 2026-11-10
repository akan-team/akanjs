---
"@akanjs/vscode": patch
---

The extension reads the failure line a newer `akan` CLI ends its JSON output with, `{"ok":false,"error":"<message>","code":"<code>"}`, as a failure: verify, the workflow commands and Studio show its message instead of failing on a missing report field or showing the raw JSON. The extension ships apart from the CLI, so an older extension that meets `@akanjs/cli` with this line shows such a failure as a broken report until it is updated.
