---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
"use-agentic": patch
---

A failed tool call now names a code a client or a model can branch on, beside the text it already sent, which is unchanged. No upgrade step is needed: `AgentWireToolResult` and `use-agentic`'s `ToolCallResult` only gain an optional `code`, and `akanjs/common` adds `MCP_FAILURE_META`, `McpFailure` and `FailureCode`.

Every code is a bounded token, a dictionary key (`<module>.error.<key>`) or one camelCase identifier, never prose, so no text can pass for one.

- **An app's `/mcp`:**
  - A tool error carries `_meta["akanjs/failure"]: { code, statusCode }`, beside the server's own `_meta` for a 2026-07-28 client. The code is the one an HTTP caller gets:
    - a domain `Err` by its dictionary key, such as `base.error.documentNotFound`;
    - an `AkanError` by its code, such as `invalidArgument` for an argument the call got wrong;
    - a guard's 401 or 403 by its status alone (`unauthorized`, `forbidden`);
    - a 5xx by the dictionary key or code token its HTTP answer carries, else by its status (`internalError`, `serviceUnavailable`). Its text is redacted but its code is not, and the code comes from the error's own JSON when that carries one, which can be a third-party library's.
  - A JSON-RPC error carries `data.code`, which tells apart what `-32602` covers:
    - `unknownTool`, `unknownPrompt` (an unlisted page prompt included) and `unknownResource`;
    - `invalidArgument` for bad arguments or a missing tool name, prompt name or resource uri;
    - a refused screen's `forbidden` or `notFound`.
    A rate-limited call names `tooManyRequests` and the catch-all names `internalError`.
  - An MCP Apps view's call that fails without a domain `Err` restores as an error with that status and code, where it used to be a plain `Error`. A tool the view itself serves to the host names its code in the same `_meta` entry, without a `statusCode`.
- **`akan mcp`:** a tool error carries the same `_meta["akanjs/failure"]`, with one of these codes:
  - `unknownTool` for a name no mode lists;
  - `toolUnavailable` for a tool outside the server's mode;
  - `invalidArgument` for a missing argument, an unknown guideline name, or a workflow path outside `.akan/workflows/`;
  - `toolFailed` for anything else, with `statusCode` 500. A coded `AkanError` keeps its own code.
- **The code agent:** an MCP server's tool result keeps the code it named, from `_meta["akanjs/failure"]` or a JSON-RPC error's `data.code`, in the call's `details`.
- **The in-page agent:** a `toolResults` entry whose tool threw carries `code` beside `error` (see `use-agentic`'s WIRE.md): a dictionary `Err`'s key, else the thrown error's own `code`. A `taint: "source"` tool's result carries none, since its code would travel outside the page-content fence. The bundled Anthropic and OpenAI adaptors send `code` to the model inside the tool result, beside `error`.
