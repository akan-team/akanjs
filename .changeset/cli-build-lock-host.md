---
"@akanjs/cli": patch
---

`akan` now records which host holds its build lock and removal markers (the host name, the platform and, on Linux, the pid namespace) and no longer judges a holder dead by a pid recorded on another host, so a devcontainer, WSL or a `--network host` container and the machine it shares a mounted checkout with stop taking over each other's live lock at once; such a lock is taken over when its 120 s lease ends, and a lock or marker an older CLI left, which names no host, is judged by its pid as before.
