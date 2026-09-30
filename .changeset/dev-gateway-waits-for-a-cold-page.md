---
"akanjs": patch
---

fix: a dev build of the iOS, Android or desktop app waits for a page the dev server is still building

The native dev gateway served with Bun's default 10 s idle timeout, so the first request for a page the dev server
was still building (27 s for a small app on a Windows VM) was closed under the app, which then fell back to its
bundled files: a dev build carries none, and the window stayed blank until the next reload. The gateway now keeps
the request open until the dev server answers.
