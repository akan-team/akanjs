---
"@akanjs/native": patch
---

`externalView.evaluate` on Linux now goes through WebKitGTK's own JavaScript call, as macOS goes through WKWebView's. A script evaluated before the view's first navigation committed used to be rejected with `CANCELLED` and then run anyway at the commit, so a retry ran it twice: it now runs once and is answered once. A result with no JSON form (undefined, an exception, a function, a cycle) used to come back as `""` and is now `null`, as the typings say. An evaluate its web process ended under answers `INTERNAL`, and one a close or a rebuild of the view cut off answers `CANCELLED`.
