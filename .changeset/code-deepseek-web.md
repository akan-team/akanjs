---
"@akanjs/cli": minor
---

`akan code` searches and reads the web through DeepSeek when the workspace has a DeepSeek key. `web_search` falls to DeepSeek's Search API when neither `BRAVE_API_KEY` nor `TAVILY_API_KEY` is set, so a DeepSeek-only workspace can search at all; results come back once per page, without tracking parameters, dated, with a summary written for a model. `web_fetch` reads a public page through DeepSeek's Fetch API as Markdown instead of tag-stripped HTML, and reads localhost, private addresses, and any page DeepSeek refuses directly, as before. `web_fetch` now hands over 10,000 characters at a time rather than only the first 2,000, and a longer page ends with the `offset` that continues it from the same snapshot. Both wait out DeepSeek's rate limit. DeepSeek bills each successful call; behind `AKAN_CODE_PROXY_URL` the DeepSeek path stays off, since the proxy keeps the key.
