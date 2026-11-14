---
"akanjs": minor
"@akanjs/cli": patch
"@akanjs/devkit": patch
"use-agentic": minor
---

`agentService.loop` can now call the tools of a screen the member has open, without running them on the server. The run parks each such call, the way an approval parks one, until the page answers it.

- **Server.** `clientTools` takes the definitions the open page sent over the app's own transport. They are listed beside the endpoint tools.
  - They are client input. Each definition is rebuilt from `name`, `description`, `parameters`, `readOnly` and `needsConfirm`. A name an endpoint tool holds is dropped, in a closed toolkit too, and so is `openToolkit`.
  - `approve` is still asked about each call. With no approver, a definition that is not `readOnly` counts as a write, and a `needsConfirm` one is refused.
  - An allowed call ends the run as `awaiting`, with `client: true` on the event. Calls written before it in the same batch have already run; calls written after it wait for the resume.
  - The run never waits on a socket. The app delivers the call to the page and resumes with the page's result as `answer` (or `{ id, error }` when no page answers). A resume without it parks the call again. A resume without `clientTools` answers it as an unknown tool.
- **Browser.** `AgentClientTools` is new in `use-agentic` and re-exported from `akanjs/ui`, along with the `ToolRunnerHost` and `ToolApprovalRequest` types.
  - `new AgentClientTools(surface?, host?).list()` gives the open screen's tools in the shape `clientTools` takes, each with `readOnly: false`.
  - `run(call)` answers a parked call through the same `ToolRunner` as the in-page chat. A `confirm` still asks through `host.approve` and is refused without one, a card tool needs `host.card`, and the answer is clipped and fenced as the chat's would be.

Both are new and optional, so no upgrade step is needed.
