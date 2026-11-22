---
"akanjs": patch
"@akanjs/devkit": patch
---

A page no longer downloads, with its own JavaScript, the code that turns form controls into agent tools. The setters, schemas and relation listings behind `useFieldTool`, `useFileFieldTool`, `useRelationFieldTool` and a form's `fill<Model>Form` load by a dynamic `import()` once the first form control or form subscription on the page mounts, and a production build leaves `FormFields` out of the `akanjs/store` entry unless a route names it. In the framework's sample apps every route that loads the store is about 1.8 KB (brotli) lighter; a page that shows no form never downloads the tools.

- **When the tools appear.** The first controls on a page publish their tools as soon as that file has loaded, a moment after they mount; later controls publish as they mount, as before. The in-page agent, `Agent.Dock`, an MCP App view and `AgentClientTools` read them as before, and an MCP App view tells its host that its tool list changed.
- **Unchanged.** The hooks, their options and `FormFields` keep their names and shapes. The single-file CSR build that native apps load still carries the tools inline.

Nothing to do. An older `@akanjs/devkit` builds this `akanjs` with `FormFields` in the store entry, as it did before.
