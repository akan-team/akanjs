---
"@akanjs/cli": patch
---

When `akan download-env` is refused with a 403, its hint no longer says only the project owner can download the env archive. It now says that the repository owner, or an owner or operator they allowed on the project's settings page, can download it, and that you need to sign in as one of them.
