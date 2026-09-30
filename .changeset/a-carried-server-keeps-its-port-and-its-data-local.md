---
"akanjs": patch
---

fix: a desktop app's server keeps its port, keeps its data on this computer, and trusts the system's CAs

- The port of the last session comes first, and a fresh one is picked only when it is taken, so an address
  registered somewhere stays valid from one launch to the next.
- Windows keeps the server's data in `%LOCALAPPDATA%\<app id>\server`, beside the webview's, instead of the Roaming
  folder a profile copies on every sign-in and an organisation may put on a file share, where SQLite's WAL does not
  work. A debug build keeps its own `server-debug` folder, since it has the release app's id.
- The server trusts the CAs of the operating system (`--use-system-ca`), as the page does, and gets the proxy and CA
  variables (`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `NODE_USE_SYSTEM_CA`), so it
  reaches what the page reaches behind an inspecting proxy.
- Bun's transpiler cache goes to `<server data>/runtime/transpiler-cache` instead of the user's home, where nothing
  removed it.
- A `PATH` in `desktop.server.env` keeps the app's own `bin` first.
