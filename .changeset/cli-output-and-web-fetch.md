---
"@akanjs/cli": patch
---

`akan code`'s `web_fetch` reads an intranet page itself instead of handing its URL to DeepSeek. In the release candidates it judged a host by its name alone, so a dotted intranet name such as `jira.corp.example.com`, a `.test` name, `localhost.` with its trailing dot, `[::]`, and a loopback or private address written IPv4-mapped (`[::ffff:127.0.0.1]`) went to DeepSeek's Fetch API. It now resolves the name first and sends the URL to DeepSeek only when every address it resolves to is public; a name that does not resolve stays on the machine.
