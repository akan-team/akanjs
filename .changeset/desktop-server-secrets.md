---
"akanjs": patch
---

A desktop app's carried server can keep a secret the user gives it, such as their own API key, in the OS credential store: `NativeSecret.set(key, value)`, `get(key)` and `remove(key)` from `akanjs/server` ask the shell that started the server over its IPC channel. The shell keeps them in the macOS Keychain, the Windows Credential Manager or the Linux Secret Service, in a store of the server's own: apart from the page's `secretStorage`, so no page script reads them, and apart for a debug build. It needs no plugin in `native.plugins`. Anywhere but a carried server `NativeSecret.available` is false and every call rejects without sending anything, a replica behind a gateway included.
