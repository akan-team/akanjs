---
"@akanjs/cli": patch
---

`akan verify` no longer flags a new one-line `// TODO: <issue url>` comment, the marker the workspace AGENTS.md asks for. A bare `TODO`, one whose url does not come first, and a multi-line block are still flagged. The managed AGENTS.md block names apps, libraries and packages up to about 160 characters per line, followed by "and N more", so a large workspace keeps it within its size cap.
