---
"akanjs": minor
"use-agentic": minor
---

The in-page agent can look at a picture on screen. A new built-in tool, `viewImage({ src })`, takes an image address that `readScreen({ images: true })` printed, redraws that `<img>` as a JPEG no longer than 1568px, and attaches it to the tool's result, so the model answers from the picture rather than its caption. It refuses an address no `<img>` on screen shows, and a `data:` one. A public picture the page may not read is sent by its address.

A tool result can now carry files in `ToolCallResult.attachments`, which have the same shape as a user's attachments. A tool of your own returns them with `ToolReturn.attach(result, [attachment])`, exported from `akanjs/store`. `AnthropicLlm` places them inside the `tool_result`. The OpenAI dialect sends them in a user message right after the turn's tool messages, and an MCP App hands a picture to the host's model as image content. Either way, they pass the same `accepts` check and image-type allow-list as a user's file, and one the model cannot read becomes a note in its place. They sit outside the 20,000-character result ceiling but meet the 4 MB per-file one. A file a tool returned before the user's latest message is sent as a note asking the model to call the tool again, and it is never written to stored history.

Upgrade note: `viewImage` joins the default built-ins, so `builtins={true}` and an omitted `builtins` now publish it. List the built-ins you want to leave it out.
